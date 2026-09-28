export type GreenApiCredentials = {
  idInstance: string
  apiTokenInstance: string
}

export type GreenApiMessage = {
  chatId: string
  message: string
}

export type GreenApiChat = {
  chatId: string
  name: string
  type: string
  phoneNumber: number
}

export type GreenApiNotification = {
  receiptId: number
  body: {
    typeWebhook?: string
    messageData?: {
      textMessageData?: {
        textMessage?: string
      }
      extendedTextMessageData?: {
        text?: string
      }
    }
    senderData?: {
      chatId?: string
      senderName?: string
      senderPhoneNumber?: number
    }
  }
}

export type GreenApiError = {
  correspondentsStatus: {
    description: string
  }
}

const apiBaseUrl = 'https://api.green-api.com'

function buildUrl(credentials: GreenApiCredentials, method: string) {
  return `${apiBaseUrl}/waInstance${credentials.idInstance}/${method}/${credentials.apiTokenInstance}`
}

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  })

  if (!response.ok) {
    const details = await response.text()
    const errorFody = JSON.parse(details) as GreenApiError
    throw new Error(errorFody.correspondentsStatus.description)
  }

  return response.json() as Promise<T>
}

export function createGreenApiClient(credentials: GreenApiCredentials) {
  return {
    sendMessage(message: GreenApiMessage) {
      return request<{ idMessage: string }>(buildUrl(credentials, 'sendMessage'), {
        method: 'POST',
        body: JSON.stringify(message),
      })
    },

    async getChats() {
      const chats = await request<GreenApiChat[]>(buildUrl(credentials, 'getChats'))
      const userChats = chats.filter((chat) => chat.type == 'user')

      return userChats
    },

    receiveNotification() {
      return request<GreenApiNotification | null>(buildUrl(credentials, 'receiveNotification'))
    },

    deleteNotification(receiptId: number) {
      return request<{ result: boolean }>(`${buildUrl(credentials, 'deleteNotification')}/${receiptId}`, {
        method: 'DELETE',
      })
    },
  }
}
