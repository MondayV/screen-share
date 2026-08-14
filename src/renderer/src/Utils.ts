export const externalLinkClickHandler = (root: HTMLButtonElement, url: string): void => {
  root.classList.add('is-loading')
  setTimeout(() => {
    root.classList.remove('is-loading')
  }, 3000)
  window.open(url)
}
