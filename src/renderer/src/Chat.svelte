<script lang="ts">
  import { onMount } from 'svelte'
  import { writable } from 'svelte/store'

  export let onSendChat: ((msg: ChatMessage) => void) | null = null
  export let visible: boolean = true

  export type ChatMessage = { from: string; text: string; time: string; type: 'text' | 'emoji' }

  const messages = writable<ChatMessage[]>([])
  let inputText = ''
  let chatLog: HTMLDivElement

  const emojis = ['👍', '👏', '🎉', '❤️', '😂', '😊', '🙏', '🔥', '💯', '🤝']

  function sendMessage() {
    const text = inputText.trim()
    if (!text || !onSendChat) return
    const msg: ChatMessage = { from: '我', text, time: new Date().toLocaleTimeString(), type: 'text' }
    onSendChat(msg)
    $messages = [...$messages, msg]
    inputText = ''
    scrollBottom()
  }

  function sendEmoji(emoji: string) {
    if (!onSendChat) return
    const msg: ChatMessage = { from: '我', text: emoji, time: new Date().toLocaleTimeString(), type: 'emoji' }
    onSendChat(msg)
    $messages = [...$messages, msg]
    scrollBottom()
  }

  export function receiveMessage(msg: ChatMessage) {
    $messages = [...$messages, msg]
    if ($messages.length > 200) $messages = $messages.slice(-200)
    scrollBottom()
  }

  function scrollBottom() {
    setTimeout(() => { if (chatLog) chatLog.scrollTop = chatLog.scrollHeight }, 50)
  }

  function handleKey(e: KeyboardEvent) { if (e.key === 'Enter') sendMessage() }
</script>

{#if visible}
  <div class="chat-panel">
    <div class="chat-header">💬 会中聊天</div>
    <div class="chat-messages" bind:this={chatLog}>
      {#each $messages as msg}
        <div class="chat-msg" class:mine={msg.from === '我'}>
          <span class="msg-from">{msg.from}</span>
          <span class="msg-text" class:emoji={msg.type === 'emoji'}>{msg.text}</span>
          <span class="msg-time">{msg.time}</span>
        </div>
      {/each}
    </div>
    <div class="chat-emoji-bar">
      {#each emojis as emoji}
        <button class="emoji-btn" on:click={() => sendEmoji(emoji)}>{emoji}</button>
      {/each}
    </div>
    <div class="chat-input-row">
      <input type="text" bind:value={inputText} on:keydown={handleKey} placeholder="输入消息..." class="chat-input" />
      <button class="chat-send-btn" on:click={sendMessage}>发送</button>
    </div>
  </div>
{/if}

<style>
  .chat-panel { display: flex; flex-direction: column; height: 100%; background: #1e1e2e; border-radius: 8px; }
  .chat-header { padding: 10px 14px; font-weight: 600; color: #cdd6f4; border-bottom: 1px solid #313244; }
  .chat-messages { flex: 1; overflow-y: auto; padding: 10px 14px; }
  .chat-msg { margin-bottom: 8px; }
  .msg-from { font-weight: 600; color: #89b4fa; font-size: 12px; margin-right: 6px; }
  .msg-text { color: #cdd6f4; font-size: 13px; }
  .msg-text.emoji { font-size: 24px; }
  .msg-time { color: #6c7086; font-size: 10px; margin-left: 8px; }
  .chat-emoji-bar { display: flex; gap: 4px; padding: 6px 14px; border-top: 1px solid #313244; }
  .emoji-btn { width: 28px; height: 28px; border: none; border-radius: 4px; background: transparent; font-size: 16px; cursor: pointer; }
  .emoji-btn:hover { background: rgba(255,255,255,0.08); }
  .chat-input-row { display: flex; gap: 6px; padding: 8px 14px; border-top: 1px solid #313244; }
  .chat-input { flex: 1; padding: 6px 10px; border: 1px solid #45475a; border-radius: 6px; background: #11111b; color: #cdd6f4; font-size: 13px; }
  .chat-send-btn { padding: 6px 14px; border: none; border-radius: 6px; background: #89b4fa; color: #1e1e2e; font-size: 13px; cursor: pointer; }
  .chat-send-btn:hover { background: #74c7ec; }
</style>
