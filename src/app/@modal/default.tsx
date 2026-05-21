// Parallel-route slot fallback. Renders nothing whenever no intercepting
// route is active — i.e. on every route except a soft navigation to one of
// the intercepted paths (`(.)signup`).
export default function ModalSlotDefault() {
  return null;
}
