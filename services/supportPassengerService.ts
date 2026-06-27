import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import type {
  PassengerMessageRow,
  PassengerMessageSender,
  SupportMessageType,
} from '@/types/supportPassenger';

const CLOUDINARY_UPLOAD_URL = 'https://api.cloudinary.com/v1_1/dso17jqic/image/upload';

export type SupportPassengerImagePick = {
  uri: string;
  mimeType?: string | null;
  fileName?: string | null;
};

/**
 * Envia a imagem para o Cloudinary (preset unsigned `support_chat_upload`) e devolve `secure_url`.
 * Igual ao app motorista.
 */
export async function uploadImagemCloudinary(file: SupportPassengerImagePick): Promise<string> {
  if (!file?.uri) {
    throw new Error('Imagem inválida.');
  }

  const data = new FormData();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data.append('file', { uri: file.uri, type: 'image/jpeg', name: 'upload.jpg' } as any);
  data.append('upload_preset', 'support_chat_upload');

  const res = await fetch(CLOUDINARY_UPLOAD_URL, {
    method: 'POST',
    body: data,
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(errText || 'Erro no upload da imagem');
  }

  const json = (await res.json()) as { secure_url?: string };
  if (!json.secure_url) {
    throw new Error('Resposta inválida do servidor de imagens');
  }
  return json.secure_url;
}

function assertConfigured(): void {
  if (!isSupabaseConfigured) {
    throw new Error('Supabase não configurado.');
  }
}

/**
 * Uma conversa por passageiro: devolve o `id` existente em `support_passenger_chats` ou cria uma linha.
 * `passenger_id` = auth.uid() do Supabase (utilizador autenticado).
 */
export async function obterOuCriarChatPassageiro(): Promise<string> {
  assertConfigured();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    throw new Error('Sessão expirada, faça login novamente');
  }

  const { data: existing, error: selectErr } = await supabase
    .from('support_passenger_chats')
    .select('id')
    .eq('passenger_id', user.id)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (selectErr) {
    throw new Error(selectErr.message || 'Não foi possível abrir a conversa.');
  }
  if (existing?.id) {
    return existing.id as string;
  }

  const { data: created, error: insertErr } = await supabase
    .from('support_passenger_chats')
    .insert([{ passenger_id: user.id, status: 'open' }])
    .select('id')
    .single();

  if (insertErr || !created?.id) {
    throw new Error(insertErr?.message || 'Não foi possível criar a conversa.');
  }
  return created.id as string;
}

/**
 * Se `paramChatId` for um `support_passenger_chats` do utilizador, usa-o; senão obtém ou cria o chat único.
 */
export async function resolverChatIdPassageiro(
  paramChatId: string | null | undefined,
): Promise<string> {
  assertConfigured();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    throw new Error('Sessão expirada, faça login novamente');
  }
  const p = typeof paramChatId === 'string' ? paramChatId.trim() : '';
  if (p) {
    const { data: own, error } = await supabase
      .from('support_passenger_chats')
      .select('id')
      .eq('id', p)
      .eq('passenger_id', user.id)
      .maybeSingle();
    if (!error && own?.id) {
      return own.id as string;
    }
  }
  return obterOuCriarChatPassageiro();
}

export async function listarMensagensPassageiro(chatId: string): Promise<PassengerMessageRow[]> {
  assertConfigured();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    throw new Error('Sessão expirada, faça login novamente');
  }

  const { data, error } = await supabase
    .from('support_passenger_messages')
    .select('id, chat_id, sender, message, type, status, created_at, reply_to_message_id, reply_preview')
    .eq('chat_id', chatId)
    .order('created_at', { ascending: true });

  if (error) {
    throw new Error(error.message || 'Não foi possível carregar as mensagens.');
  }
  return (data ?? []).map(normalizeMessageRow) as PassengerMessageRow[];
}

function normalizeMessageRow(
  row: PassengerMessageRow & {
    type?: string | null;
    sender?: string | null;
    reply_to_message_id?: string | null;
    reply_preview?: string | null;
  },
): PassengerMessageRow {
  const t = row.type;
  const type: SupportMessageType = t === 'image' || t === 'text' ? t : 'text';
  const sender: PassengerMessageSender = row.sender === 'passenger' ? 'passenger' : 'support';
  return {
    ...row,
    type,
    sender,
    reply_to_message_id: row.reply_to_message_id ?? null,
    reply_preview: row.reply_preview ?? null,
  };
}

const REPLY_PREVIEW_MAX = 500;

export type EnviarMensagemPassageiroOptions = {
  replyToId?: string;
  replyPreview?: string;
};

export async function apagarMensagemPassageiro(messageId: string): Promise<void> {
  assertConfigured();
  const { error } = await supabase.from('support_passenger_messages').delete().eq('id', messageId);
  if (error) {
    throw new Error(error.message || 'Não foi possível eliminar a mensagem.');
  }
}

export async function enviarMensagemPassageiro(
  chatId: string,
  texto: string,
  type: SupportMessageType = 'text',
  options?: EnviarMensagemPassageiroOptions,
): Promise<PassengerMessageRow> {
  assertConfigured();
  const message = texto.trim();
  if (!message) {
    throw new Error(
      type === 'image' ? 'Imagem inválida.' : 'Escreva uma mensagem antes de enviar.',
    );
  }
  const replyId = options?.replyToId;
  if (replyId) {
    const preview = (options?.replyPreview ?? '').trim();
    if (!preview) {
      throw new Error('Falta pré-visualização da resposta.');
    }
  }
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    throw new Error('Sessão expirada, faça login novamente');
  }
  const replyPreviewForDb = replyId
    ? (options?.replyPreview ?? '').trim().slice(0, REPLY_PREVIEW_MAX) || null
    : null;

  const { data, error } = await supabase
    .from('support_passenger_messages')
    .insert([
      {
        chat_id: chatId,
        sender: 'passenger',
        message,
        type,
        status: 'sent',
        reply_to_message_id: replyId ?? null,
        reply_preview: replyPreviewForDb,
      },
    ])
    .select('id, chat_id, sender, message, type, status, created_at, reply_to_message_id, reply_preview')
    .single();

  if (error || !data) {
    throw new Error(error?.message || 'Não foi possível enviar a mensagem.');
  }
  return normalizeMessageRow(data as PassengerMessageRow) as PassengerMessageRow;
}

/**
 * RPC específica do passageiro (se existir no Supabase). O ecrã ignora erros com `.catch`.
 */
export async function marcarConversaComoLidaPassageiro(chatId: string): Promise<void> {
  assertConfigured();
  const { error } = await supabase.rpc('support_passenger_mark_chat_read', { p_chat_id: chatId });
  if (error) {
    throw new Error(error.message || 'Não foi possível atualizar o estado da conversa.');
  }
}

export type SupportPassengerRealtimeSubscription = {
  unsubscribe: () => void;
};

export type SupportPassengerMessagesHandlers = {
  onInsert: (row: PassengerMessageRow) => void;
  onUpdate: (row: PassengerMessageRow) => void;
  onDelete?: (messageId: string) => void;
};

export function inscreverMensagensPassageiro(
  chatId: string,
  handlers: SupportPassengerMessagesHandlers,
): SupportPassengerRealtimeSubscription {
  const channelId = `support_passenger_rt:${chatId}:${Math.random().toString(36).slice(2)}`;
  const channel = supabase
    .channel(channelId)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'support_passenger_messages',
        filter: `chat_id=eq.${chatId}`,
      },
      (payload) => {
        const row = payload.new as (PassengerMessageRow & { type?: string | null }) | null;
        if (row?.id) {
          handlers.onInsert(normalizeMessageRow(row));
        }
      },
    )
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'support_passenger_messages',
        filter: `chat_id=eq.${chatId}`,
      },
      (payload) => {
        const row = payload.new as (PassengerMessageRow & { type?: string | null }) | null;
        if (row?.id) {
          handlers.onUpdate(normalizeMessageRow(row));
        }
      },
    )
    .on(
      'postgres_changes',
      {
        event: 'DELETE',
        schema: 'public',
        table: 'support_passenger_messages',
        filter: `chat_id=eq.${chatId}`,
      },
      (payload) => {
        const id = (payload.old as { id?: string } | null)?.id;
        if (id && handlers.onDelete) {
          handlers.onDelete(id);
        }
      },
    )
    .subscribe();

  return {
    unsubscribe: () => {
      void supabase.removeChannel(channel);
    },
  };
}
