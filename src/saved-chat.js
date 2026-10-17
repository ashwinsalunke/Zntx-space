export async function loadSavedChat(id, api, signal) {
  const chat = await api("/api/records/chats/" + encodeURIComponent(id), { signal });
  if (!chat || !Array.isArray(chat.turnIds)) throw Error("This research chat could not be read.");
  const ids = [...new Set(chat.turnIds)];
  const turns = new Array(ids.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(4, ids.length) }, async () => {
    while (cursor < ids.length) {
      const index = cursor++;
      const turn = await api("/api/records/notes/" + encodeURIComponent(ids[index]), { signal });
      if (turn.chatId !== id) throw Error("A saved turn does not belong to this chat.");
      turns[index] = turn;
    }
  }));
  return { chat, turns };
}
