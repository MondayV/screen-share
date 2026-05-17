<script lang="ts">
  export let sources: { id: string; name: string; thumbnail: string }[] = [];
  export let onSelect: (sourceId: string) => void = () => {};
  export let onCancel: () => void = () => {};

  let selectedId: string | null = null;
</script>

<div class="modal is-active">
  <div class="modal-background" role="button" tabindex="-1" on:click={onCancel} on:keydown={(e) => { if (e.key === 'Escape') onCancel(); }}></div>
  <div class="modal-card" style="max-width: 640px;">
    <header class="modal-card-head">
      <p class="modal-card-title">选择共享源</p>
      <button class="delete" aria-label="关闭" on:click={onCancel}></button>
    </header>
    <section class="modal-card-body">
      <div class="grid" style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
        {#each sources as source}
          <div
            class="box p-2"
            style="cursor: pointer; border: {selectedId === source.id ? '2px solid #485fc7' : '2px solid transparent'}; transition: border-color 0.15s;"
            on:click={() => { selectedId = source.id; onSelect(source.id); }}
            on:keydown={(e) => { if (e.key === 'Enter') { selectedId = source.id; onSelect(source.id); } }}
            role="button"
            tabindex="0"
          >
            <figure class="image is-16by9 mb-2">
              <img src={source.thumbnail} alt={source.name} style="object-fit: cover; border-radius: 4px;" />
            </figure>
            <p class="has-text-centered is-size-7" style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">{source.name}</p>
          </div>
        {/each}
      </div>
    </section>
    <footer class="modal-card-foot">
      <button class="button" on:click={onCancel}>取消</button>
      <button class="button is-primary" disabled={!selectedId} on:click={() => selectedId && onSelect(selectedId)}>开始共享</button>
    </footer>
  </div>
</div>
