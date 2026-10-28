/** Aviso de reposición por Telegram (bot). Sin token configurado no se manda nada: la app igual muestra el aviso en pantalla. */
export type Notificador = (destino: { chat: string; nombre: string }, texto: string) => Promise<void>;

export const sinNotificador: Notificador = async () => {};

export function telegramNotificador(token: string, fetchFn: typeof fetch = fetch): Notificador {
  return async ({ chat }, texto) => {
    if (!chat.trim()) return; // esta cuenta no tiene a quién avisar por Telegram
    const res = await fetchFn(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chat.trim(), text: texto }),
    });
    if (!res.ok) throw new Error(`Telegram respondió ${res.status}`);
  };
}
