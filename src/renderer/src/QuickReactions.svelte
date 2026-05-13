<script lang="ts">
  import { onDestroy } from 'svelte'

  export let onSendReaction: ((emoji: string) => void) | null = null
  export let visible: boolean = true

  const reactions = ['👍', '👏', '🎉', '❤️', '😲', '🙏']

  let floatingEmojis: { id: number; emoji: string; x: number }[] = []
  let counter = 0

  function sendReaction(emoji: string) {
    if (onSendReaction) onSendReaction(emoji)
    const id = ++counter
    const x = Math.random() * 60 + 20 // random horizontal position
    floatingEmojis = [...floatingEmojis, { id, emoji, x }]
    setTimeout(() => {
      floatingEmojis = floatingEmojis.filter(f => f.id !== id)
    }, 1800)
  }

  export function showReceivedReaction(emoji: string) {
    const id = ++counter
    const x = Math.random() * 60 + 20
    floatingEmojis = [...floatingEmojis, { id, emoji, x }]
    setTimeout(() => {
      floatingEmojis = floatingEmojis.filter(f => f.id !== id)
    }, 1800)
  }
</script>

{#if visible}
  <div class="reaction-bar">
    {#each reactions as emoji}
      <button class="reaction-btn" on:click={() => sendReaction(emoji)}>{emoji}</button>
    {/each}
  </div>

  <!-- Floating emoji animations -->
  {#each floatingEmojis as fe (fe.id)}
    <div class="floating-emoji" style="left: {fe.x}%">{fe.emoji}</div>
  {/each}
{/if}

<style>
  .reaction-bar { display: flex; gap: 8px; justify-content: center; padding: 8px; }
  .reaction-btn { width: 40px; height: 40px; border: 1px solid #45475a; border-radius: 50%; background: transparent; font-size: 20px; cursor: pointer; }
  .reaction-btn:hover { background: rgba(255,255,255,0.08); }
  .floating-emoji {
    position: fixed; bottom: 120px; font-size: 36px; pointer-events: none; z-index: 9999;
    animation: floatUp 1.5s ease-out forwards;
  }
  @keyframes floatUp {
    0% { opacity: 1; transform: translateY(0) scale(1); }
    100% { opacity: 0; transform: translateY(-120px) scale(1.4); }
  }
</style>
