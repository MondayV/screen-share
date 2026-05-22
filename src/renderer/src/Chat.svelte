<script lang="ts">
  import { onDestroy } from 'svelte'
  import { on, off, sendChat } from './lib/signaling'

  let messages: { text: string; color: string; peerId: string; timestamp: number }[] = []
  let input = ''
  let chatRef: HTMLDivElement

  const handler = (msg: any): void => {
    messages = [...messages, msg]
    if (messages.length > 100) messages = messages.slice(-100)
    setTimeout(() => { if (chatRef) chatRef.scrollTop = chatRef.scrollHeight }, 50)
  }
  on('chat', handler)
  onDestroy(() => off('chat', handler))

  const send = (): void => {
    if (!input.trim()) return
    sendChat(input.trim())
    input = ''
  }
</script>

<div class="chat-panel">
  <div class="chat-messages" bind:this={chatRef}>
    {#each messages as msg}
      <div class="chat-msg">
        <span class="chat-dot" style="background:{msg.color}"></span>
        <span class="chat-text">{msg.text}</span>
      </div>
    {/each}
  </div>
  <div class="chat-input-row">
    <input class="chat-input" bind:value={input} placeholder="输入消息..." on:keydown={(e) => e.key === 'Enter' && send()}/>
    <button class="chat-send" on:click={send}>发送</button>
  </div>
</div>

<style>
.chat-panel {
  display: flex; flex-direction: column;
  border: 1px solid var(--border-color, #ccc);
  border-radius: var(--button-radius, 4px);
  background: var(--card-bg, var(--bg-secondary, #f5f5f5));
  overflow: hidden; max-height: 260px; margin-top: 12px;
}
.chat-messages {
  flex: 1; overflow-y: auto; padding: 8px; min-height: 80px; max-height: 180px;
}
.chat-msg {
  display: flex; align-items: flex-start; gap: 6px; margin: 3px 0; font-size: 13px;
}
.chat-dot {
  width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; margin-top: 4px;
}
.chat-text { color: var(--text-primary, #333); word-break: break-word; }
.chat-input-row {
  display: flex; border-top: 1px solid var(--border-color, #ccc);
}
.chat-input {
  flex: 1; border: none; padding: 8px; font-size: 13px;
  background: var(--input-bg, #fff); color: var(--text-primary, #333);
  outline: none;
}
.chat-send {
  padding: 8px 14px; border: none; cursor: pointer;
  background: var(--accent-secondary, #00d1b2); color: #fff;
  font-weight: 600; font-size: 13px;
}
</style>
