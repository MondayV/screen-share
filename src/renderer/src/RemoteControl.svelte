<script lang="ts">
  import Swal from 'sweetalert2'

  export let controlEnabled: boolean = false
  export const isHost: boolean = false
  export let onRequestControl: (() => void) | null = null
  export const onEndControl: (() => void) | null = null
  export let onGrantControl: (() => void) | null = null
  export let onDenyControl: (() => void) | null = null

  let pendingRequest = false

  export function requestControl() {
    if (onRequestControl) onRequestControl()
    pendingRequest = true
  }

  export function showRequestDialog(fromName: string) {
    Swal.fire({
      title: '远程控制请求',
      html: `<strong>${fromName}</strong> 请求远程控制您的电脑`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: '同意',
      cancelButtonText: '拒绝',
      confirmButtonColor: '#2ecc71',
      cancelButtonColor: '#e74c3c',
      reverseButtons: true
    }).then((result) => {
      if (result.isConfirmed) {
        if (onGrantControl) onGrantControl()
      } else {
        if (onDenyControl) onDenyControl()
      }
    })
  }

  export function notifyControlGranted() {
    pendingRequest = false
    controlEnabled = true
    Swal.fire({ icon: 'success', title: '远程控制已启用', timer: 1500, showConfirmButton: false })
  }

  export function notifyControlDenied() {
    pendingRequest = false
    Swal.fire({ icon: 'error', title: '远程控制请求被拒绝', timer: 1500, showConfirmButton: false })
  }

  export function notifyControlEnded() {
    controlEnabled = false
    pendingRequest = false
    Swal.fire({ icon: 'info', title: '远程控制已结束', timer: 1500, showConfirmButton: false })
  }
</script>

<!-- Remote control is logic-only; UI triggered by Swal dialogs and Host/Join buttons -->
