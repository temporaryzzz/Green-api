import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { createGreenApiClient } from './api/greenApi'

type Credentials = { idInstance: string; apiTokenInstance: string }
type Message = { id: string; text: string; direction: 'incoming' | 'outgoing'; timestamp: string }
type Chat = { chatId: string; name: string; type: string; phoneNumber: number }
type GreenApiClient = ReturnType<typeof createGreenApiClient>

const storageKey = 'green-api-credentials'

function normalizePhoneNumber(value: string) {
  return value.replace(/\D/g, '')
}

function phoneNumberToChatId(value: string) {
  return `${normalizePhoneNumber(value)}@c.us`
}

function isValidPhoneNumber(value: string) {
  const normalizedValue = normalizePhoneNumber(value)
  return normalizedValue.length >= 10 && normalizedValue.length <= 15
}

function readCredentials(): Credentials | null {
  const saved = localStorage.getItem(storageKey)
  if (!saved) return null
  try {
    return JSON.parse(saved) as Credentials
  } catch {
    localStorage.removeItem(storageKey)
    return null
  }
}

function App() {
  const [credentials, setCredentials] = useState<Credentials | null>(readCredentials)
  const [apiClient, setApiClient] = useState<GreenApiClient | null>(() =>
    credentials ? createGreenApiClient(credentials) : null,
  )
  const [idInstance, setIdInstance] = useState(credentials?.idInstance ?? '')
  const [apiTokenInstance, setApiTokenInstance] = useState(credentials?.apiTokenInstance ?? '')
  const [phoneNumber, setPhoneNumber] = useState('')
  const phoneNumberRef = useRef('')
  const [messageText, setMessageText] = useState('')
  const [messages, setMessages] = useState<Message[]>([])
  const [chats, setChats] = useState<Chat[]>([])
  const [status, setStatus] = useState('Готов к подключению')
  const [isSending, setIsSending] = useState(false)
  const [isLoadingChats, setIsLoadingChats] = useState(Boolean(credentials))

  useEffect(() => {
    if (!apiClient) return
    apiClient
      .getChats()
      .then(setChats)
      .catch(() => setStatus('Чаты пока недоступны'))
      .finally(() => setIsLoadingChats(false))
  }, [apiClient])

  useEffect(() => {
    if (!apiClient) return
    const client = apiClient
    let isChecking = false

    async function checkNotifications() {
      if (isChecking) return
      isChecking = true

      try {
        const notification = await client.receiveNotification()
        if (!notification) return

        const { body } = notification
        const text =
          body.messageData?.textMessageData?.textMessage ?? body.messageData?.extendedTextMessageData?.text
        const incomingChatId = body.senderData?.chatId
        const incomingPhoneNumber = body.senderData?.senderPhoneNumber
        const selectedPhoneNumber = phoneNumberRef.current
        const selectedChat = chats.find(
          (chat) => normalizePhoneNumber(String(chat.phoneNumber)) === selectedPhoneNumber,
        )
        const isSelectedChat = incomingPhoneNumber
          ? String(incomingPhoneNumber) === selectedPhoneNumber
          : incomingChatId === selectedChat?.chatId

        if (body.typeWebhook === 'incomingMessageReceived' && text && isSelectedChat) {
          setMessages((current) => [
            ...current,
            {
              id: crypto.randomUUID(),
              text,
              direction: 'incoming',
              timestamp: new Date().toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              }),
            },
          ])
        }

        await client.deleteNotification(notification.receiptId)
      } catch {
        setStatus('Не удалось проверить уведомления')
      } finally {
        isChecking = false
      }
    }

    checkNotifications()
    const intervalId = window.setInterval(checkNotifications, 5000)

    return () => {
      window.clearInterval(intervalId)
    }
  }, [apiClient, chats])

  function handleAuthorize(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!idInstance.trim() || !apiTokenInstance.trim()) return
    const nextCredentials = {
      idInstance: idInstance.trim(),
      apiTokenInstance: apiTokenInstance.trim(),
    }
    localStorage.setItem(storageKey, JSON.stringify(nextCredentials))
    setIsLoadingChats(true)
    setApiClient(createGreenApiClient(nextCredentials))
    setCredentials(nextCredentials)
    setStatus('Подключено к Telegram')
  }

  function handleLogout() {
    localStorage.removeItem(storageKey)
    setApiClient(null)
    setCredentials(null)
    setChats([])
    setMessages([])
    phoneNumberRef.current = ''
    setPhoneNumber('')
  }

  async function handleSend(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!apiClient || !phoneNumber || !messageText.trim()) return

    setIsSending(true)
    setStatus('Отправляем в Telegram...')

    try {
      await apiClient.sendMessage({
        chatId: phoneNumberToChatId(phoneNumber),
        message: messageText.trim(),
      })
      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          text: messageText.trim(),
          direction: 'outgoing',
          timestamp: new Date().toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
          }),
        },
      ])
      setMessageText('')
      setStatus('Сообщение отправлено')
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Не удалось отправить сообщение')
    } finally {
      setIsSending(false)
    }
  }

  const selectedChat = chats.find(
    (chat) =>
      normalizePhoneNumber(String(chat.phoneNumber)) ===
      normalizePhoneNumber(phoneNumber),
  )
  const normalizedPhoneNumber = normalizePhoneNumber(phoneNumber)
  const titleChat = selectedChat?.name
    ?? (isValidPhoneNumber(phoneNumber) ? normalizedPhoneNumber : 'Выберите чат')

  if (!credentials) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#0e1621] p-5 text-white">
        <form className="flex w-full max-w-96 flex-col gap-4 bg-[#17212b] p-6" onSubmit={handleAuthorize}>
          <h1 className="text-[#2aabee]">Telegram / Green-API</h1>
          <p className="text-slate-400">Авторизация</p>
          <label className="text-slate-300">
            idInstance
            <input
              className="mt-2 w-full rounded-md bg-[#0e1621] p-3 text-white outline-[#2aabee]"
              value={idInstance}
              onChange={(event) => setIdInstance(event.target.value)}
              placeholder="1101..."
            />
          </label>
          <label className="text-slate-300">
            apiTokenInstance
            <input
              className="mt-2 w-full rounded-md bg-[#0e1621] p-3 text-white outline-[#2aabee]"
              type="password"
              value={apiTokenInstance}
              onChange={(event) => setApiTokenInstance(event.target.value)}
              placeholder="Введите токен"
            />
          </label>
          <button
            className="cursor-pointer rounded-md bg-[#2aabee] p-3 text-white hover:opacity-75"
            type="submit"
          >
            Войти
          </button>
        </form>
      </main>
    )
  }

  return (
    <main className="h-screen bg-[#0e1621] text-white">
      <div className="flex h-full overflow-hidden">
        <aside className="flex w-64 flex-col overflow-auto bg-[#17212b] p-4">
          <div className="flex items-center justify-between">
            <h1 className="text-[#2aabee]">Green-API Telegram</h1>
          </div>
          <h2 className="p-4 text-[#2aabee]">Чаты ({chats.length})</h2>
          <div className="flex flex-col">
            {isLoadingChats ? (
              <p className="p-4 text-slate-400">Загрузка...</p>
            ) : chats.length === 0 ? (
              <p className="p-4 text-slate-400">Список пуст</p>
            ) : (
              chats.map((chat) => {
                const isSelected =
                  normalizePhoneNumber(String(chat.phoneNumber)) === normalizePhoneNumber(phoneNumber)
                return (
                  <button
                    className={`p-4 text-left ${isSelected ? 'bg-[#2aabee]/20' : 'text-white'}`}
                    key={chat.chatId}
                    onClick={() => {
                      phoneNumberRef.current = normalizePhoneNumber(String(chat.phoneNumber))
                      setPhoneNumber(String(chat.phoneNumber))
                      setStatus('')
                      setMessages([])
                    }}
                  >
                    <span className="block">{chat.name}</span>
                    <small className="text-slate-400">{chat.phoneNumber}</small>
                  </button>
                )
              })
            )}
          </div>
          <button className="mt-auto p-3 text-left text-slate-400" onClick={handleLogout}>
            Изменить credentials
          </button>
        </aside>

        <section className="flex min-w-0 flex-1 flex-col bg-[#0e1621]">
          <header className="flex h-16 items-center gap-4 bg-[#17212b] p-4">
            <h2>{titleChat}</h2>
            <span className="ml-auto text-slate-400">{status}</span>
          </header>
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex flex-1 flex-col justify-end gap-3 overflow-y-auto p-4">
              {messages.length === 0 ? (
                <p className="m-auto text-slate-500">Выберите чат и отправьте сообщение</p>
              ) : (
                messages.map((message) => (
                  <div
                    className={`flex ${message.direction === 'outgoing' ? 'justify-end' : 'justify-start'}`}
                    key={message.id}
                  >
                    <div
                      className={`max-w-3/4 p-3 ${message.direction === 'outgoing' ? 'bg-[#2b5278]' : 'bg-[#17212b]'}`}
                    >
                      <p>{message.text}</p>
                      <time className="text-xs text-slate-400">{message.timestamp}</time>
                    </div>
                  </div>
                ))
              )}
            </div>
            <form className="flex flex-col gap-2 bg-[#17212b] p-4" onSubmit={handleSend}>
              <input
                className="rounded-md bg-[#0e1621] p-3 text-white outline-[#2aabee]"
                value={phoneNumber}
                onChange={(event) => {
                  phoneNumberRef.current = normalizePhoneNumber(event.target.value)
                  setPhoneNumber(event.target.value)
                }}
                placeholder="Номер телефона"
              />
              <div className="flex gap-2">
                <input
                  className="min-w-0 flex-1 rounded-md bg-[#0e1621] p-3 text-white outline-[#2aabee]"
                  value={messageText}
                  onChange={(event) => setMessageText(event.target.value)}
                  placeholder="Сообщение"
                />
                <button
                  className="cursor-pointer rounded-md bg-[#2aabee] px-4 text-white hover:opacity-75"
                  type="submit"
                  disabled={isSending || !phoneNumber || !messageText.trim()}
                >
                  {isSending ? '...' : 'Отправить'}
                </button>
              </div>
            </form>
          </div>
        </section>
      </div>
    </main>
  )
}

export default App
