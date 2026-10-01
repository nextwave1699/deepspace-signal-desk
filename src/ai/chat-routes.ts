/**
 * In-app AI chat: create, rename and delete chats, and stream an assistant
 * turn with tools, context compaction and persisted history.
 */
import type { Context, Hono } from 'hono'
import { createUIMessageStreamResponse, toUIMessageStream, type ModelMessage } from 'ai'
import {
  deepSpaceAgentErrorSummary,
  prepareMessagesWithCompaction,
  listDeepSpaceAgentModels,
  resolveDeepSpaceAgentModel,
  streamDeepSpaceAgent,
  turnsToCoreMessages,
  buildUiParts,
  makeDefaultSummarizer,
  createUserToolExecutor,
  DEFAULT_CONTEXT_CONFIG,
  getChat,
  createChat,
  updateChat,
  deleteChatCascade,
  loadMessages,
  appendMessage,
  loggableError,
} from 'deepspace/worker'
import type { AgentToolAccessResult, ChatTurn, VerifyResult } from 'deepspace/worker'
import { schemas } from '../schemas.js'
import { buildSystemPrompt } from './tools.js'
import type { buildTools } from './tools.js'
import type { Env, AppContext } from '../../worker.js'

type ResolveAccess = (req: Request, env: Env) => Promise<AgentToolAccessResult>
type ToolFactory = typeof buildTools

function recordRoomStub(env: Env): DurableObjectStub {
  // Keyed by app id, never APP_NAME, to match the room the browser subscribes to.
  return env.RECORD_ROOMS.get(env.RECORD_ROOMS.idFromName(`app:${env.DEEPSPACE_APP_ID}`))
}

const MAX_USER_CONTENT_LENGTH = 100_000

function deriveTitle(content: string): string {
  const first =
    content
      .trim()
      .split('\n')
      .map((l) => l.trim())
      .find(Boolean) ?? 'Untitled'
  return first.length <= 50 ? first : first.slice(0, 47).trimEnd() + '…'
}

export function registerAiChatRoutes(
  app: Hono<AppContext>,
  resolveAccess: ResolveAccess,
  buildTools: ToolFactory,
): void {
  const requireAccess = async (c: Context<AppContext>): Promise<VerifyResult | Response> => {
    const access = await resolveAccess(c.req.raw, c.env)
    if (access.ok) return access.auth
    const error =
      access.status === 401
        ? 'Unauthorized'
        : access.status === 403
          ? 'Forbidden'
          : 'Temporarily unavailable'
    return c.json({ error }, access.status)
  }

  app.post('/api/ai/chats', async (c) => {
    const auth = await requireAccess(c)
    if (auth instanceof Response) return auth

    const body = await c.req.json<{ title?: string }>().catch(() => ({}) as { title?: string })
    const stub = recordRoomStub(c.env)
    const chat = await createChat(stub, auth.userId, {
      title: body.title ?? 'New chat',
    })
    return c.json({ chat })
  })

  app.patch('/api/ai/chats/:id', async (c) => {
    const auth = await requireAccess(c)
    if (auth instanceof Response) return auth

    const id = c.req.param('id')
    const stub = recordRoomStub(c.env)
    const chat = await getChat(stub, id, auth.userId)
    if (!chat) return c.json({ error: 'Not found' }, 404)

    const body = await c.req.json<{ title?: string }>().catch(() => ({}) as { title?: string })
    const patch: { title?: string } = {}
    if (typeof body.title === 'string') patch.title = body.title
    if (!(await updateChat(stub, id, auth.userId, patch)))
      return c.json({ error: 'Not found' }, 404)
    return c.json({ ok: true })
  })

  app.delete('/api/ai/chats/:id', async (c) => {
    const auth = await requireAccess(c)
    if (auth instanceof Response) return auth

    const id = c.req.param('id')
    const stub = recordRoomStub(c.env)
    const chat = await getChat(stub, id, auth.userId)
    if (!chat) return c.json({ error: 'Not found' }, 404)

    await deleteChatCascade(stub, id, auth.userId)
    return c.json({ ok: true })
  })

  // Known limitation: concurrent sends to one chat from two tabs can interleave writes.
  app.post('/api/ai/chat', async (c) => {
    const auth = await requireAccess(c)
    if (auth instanceof Response) return auth

    const authHeader = c.req.header('Authorization') ?? ''
    const jwt = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
    if (!jwt) return c.json({ error: 'Unauthorized' }, 401)

    const { chatId, userMessageId, content, modelId } = await c.req.json<{
      chatId?: string
      userMessageId?: string
      content?: string
      modelId?: string
    }>()
    if (typeof chatId !== 'string' || !chatId) return c.json({ error: 'chatId is required' }, 400)
    if (typeof userMessageId !== 'string' || !userMessageId)
      return c.json({ error: 'userMessageId is required' }, 400)
    if (typeof content !== 'string' || content.trim() === '')
      return c.json({ error: 'content is required' }, 400)
    if (content.length > MAX_USER_CONTENT_LENGTH) {
      return c.json({ error: `content exceeds ${MAX_USER_CONTENT_LENGTH} chars` }, 413)
    }
    const selectedModel = resolveDeepSpaceAgentModel(modelId, 'application')
    if (!selectedModel) {
      const modelIds = listDeepSpaceAgentModels('application').map((model) => model.id)
      return c.json(
        {
          error: `Unknown modelId: ${modelId}. Valid: ${modelIds.join(', ')}`,
          code: 'unknown_model',
          modelIds,
        },
        400,
      )
    }

    const stub = recordRoomStub(c.env)
    const chat = await getChat(stub, chatId, auth.userId)
    if (!chat) {
      console.warn('[ai-chat] REQUEST chat-not-found', { userId: auth.userId, chatId })
      return c.json({ error: 'Chat not found' }, 404)
    }

    const history = await loadMessages(stub, chatId, auth.userId)
    const rawTurns: ChatTurn[] = history.map((m) => ({
      id: m.recordId,
      role: m.role,
      content: m.content,
      parts: m.parts,
    }))

    // Drop consecutive user turns (orphans from failed writes) after appending this one.
    const allTurns: ChatTurn[] = [...rawTurns, { id: userMessageId, role: 'user', content }]
    const turns: ChatTurn[] = []
    for (let i = 0; i < allTurns.length; i++) {
      if (allTurns[i].role === 'user' && allTurns[i + 1]?.role === 'user') continue
      turns.push(allTurns[i])
    }

    const cachedSummary =
      chat.compactedSummary && chat.compactedThroughId
        ? { text: chat.compactedSummary, throughId: chat.compactedThroughId }
        : undefined

    const summarizer = makeDefaultSummarizer(c.env, { authToken: jwt })
    const { messages: prepared, newSummary } = await prepareMessagesWithCompaction(
      turns,
      DEFAULT_CONTEXT_CONFIG,
      { summarizer, cachedSummary },
    )
    if (newSummary) {
      await updateChat(stub, chatId, auth.userId, {
        compactedSummary: newSummary.text,
        compactedThroughId: newSummary.throughId,
      })
    }

    const usedModelId = selectedModel.modelId
    const diagnosticContext = {
      profile: 'application' as const,
      provider: selectedModel.provider,
      modelId: usedModelId,
    }
    const baseSystem = buildSystemPrompt(c.env.APP_NAME, schemas)

    // Fold a compaction summary into `system` so there is only one system message.
    const [first, ...rest] = prepared
    const summary = first?.role === 'system' ? first : null
    const systemText = summary ? `${baseSystem}\n\n${summary.content}` : baseSystem
    const messages = turnsToCoreMessages(summary ? rest : prepared)

    // Tools run as the verified user and are cancelled with the request.
    const tools = buildTools(createUserToolExecutor(c.env, auth.userId, c.req.raw.signal))

    // Minted before streaming so the client can dedup its overlay by id, not by clock.
    const asstId = `asst-${Date.now()}-${crypto.randomUUID()}`

    const persistTurn = async (text: string, responseMessages: ModelMessage[]): Promise<void> => {
      const parts = buildUiParts(responseMessages)
      if (text.trim() === '' && parts.length === 0) {
        console.warn('[ai-chat] FINISH empty turn, skipping persist')
        return
      }

      // Write user, then assistant, then metadata. If the user row fails, skip the
      // rest so the history never holds an assistant turn without its question.
      const writeWithRetry = async (
        label: string,
        fn: () => Promise<boolean | void>,
      ): Promise<boolean> => {
        for (let attempt = 1; attempt <= 2; attempt++) {
          try {
            if ((await fn()) === false) {
              console.warn(`[ai-chat] ${label} skipped — chat ${chatId} no longer exists`)
              return false
            }
            return true
          } catch (err) {
            console.error(`[ai-chat] ${label} ${attempt === 1 ? 'failed, retrying once' : 'retry failed'}: ${loggableError(err)}`)
          }
        }
        return false
      }

      const userOk = await writeWithRetry('user message', () =>
        appendMessage(stub, {
          id: userMessageId,
          chatId,
          userId: auth.userId,
          role: 'user',
          content,
        }),
      )
      if (!userOk) {
        console.error(
          '[ai-chat] FINISH aborting — user write did not land; skipping assistant + metadata to avoid orphan rows',
        )
        return
      }
      const assistantOk = await writeWithRetry('assistant message', () =>
        appendMessage(stub, {
          id: asstId,
          chatId,
          userId: auth.userId,
          role: 'assistant',
          content: text,
          ...(parts.length > 0 ? { parts } : {}),
        }),
      )
      if (!assistantOk) return
      await writeWithRetry('chat metadata', async () => {
        // Re-read so a rename made mid-stream is not overwritten by the auto-title.
        const fresh = await getChat(stub, chatId, auth.userId)
        const patch: { title?: string; model?: string } = { model: usedModelId }
        if (fresh && (!fresh.title || fresh.title === 'New chat')) {
          patch.title = deriveTitle(content)
        }
        return updateChat(stub, chatId, auth.userId, patch)
      })
    }

    const { result } = streamDeepSpaceAgent(c.env, {
      profile: 'application',
      modelId: usedModelId,
      authToken: jwt,
      instructions: systemText,
      messages,
      tools,
      abortSignal: c.req.raw.signal,
      onError: ({ error }) => {
        console.error(
          `[ai-chat] stream error: ${deepSpaceAgentErrorSummary(error, diagnosticContext)}`,
        )
      },
      onEnd: ({ text, responseMessages }) => persistTurn(text, responseMessages as ModelMessage[]),
      // onEnd does not run on abort; persist whatever steps completed.
      onAbort: ({ steps }) => {
        const last = steps.at(-1)
        if (!last) return
        return persistTurn(last.text, steps.flatMap((step) => step.response.messages) as ModelMessage[])
      },
    })

    return createUIMessageStreamResponse({
      headers: {
        'X-Asst-Id': asstId,
      },
      stream: toUIMessageStream({
        stream: result.stream,
        // The UI has no reasoning view yet, so reasoning chunks are not sent.
        sendReasoning: false,
        onError: (error: unknown): string => {
          // Surface the real message so RBAC and validation failures are debuggable.
          console.error(`[ai-chat] response error: ${loggableError(error)}`)
          return error instanceof Error ? error.message : String(error)
        },
      }),
    })
  })
}
