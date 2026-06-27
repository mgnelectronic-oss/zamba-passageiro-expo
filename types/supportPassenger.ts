export type PassengerMessageSender = 'passenger' | 'support';

export type SupportMessageStatus = 'sent' | 'delivered' | 'read';

export type SupportMessageType = 'text' | 'image';

export type PassengerChatReplyTarget = {
  id: string;
  content: string;
  type: SupportMessageType;
  sender: PassengerMessageSender;
};

export function toPassengerChatReplyTarget(m: PassengerMessageRow): PassengerChatReplyTarget {
  return {
    id: m.id,
    content: m.message,
    type: m.type,
    sender: m.sender,
  };
}

/** Tabela `support_passenger_messages`. */
export type PassengerMessageRow = {
  id: string;
  chat_id: string;
  sender: PassengerMessageSender;
  message: string;
  type: SupportMessageType;
  status: SupportMessageStatus;
  created_at: string;
  reply_to_message_id: string | null;
  reply_preview: string | null;
};

const REPLY_PREVIEW_MAX_LEN = 120;

export function getReplyPreviewForTarget(t: PassengerChatReplyTarget): string {
  if (t.type === 'image') {
    return '📷 Imagem';
  }
  const text = t.content.trim();
  if (!text) {
    return 'Mensagem';
  }
  return text.length > REPLY_PREVIEW_MAX_LEN ? `${text.slice(0, REPLY_PREVIEW_MAX_LEN)}…` : text;
}

export function getReplyPreviewForMessage(msg: PassengerMessageRow): string {
  return getReplyPreviewForTarget(toPassengerChatReplyTarget(msg));
}
