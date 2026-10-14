/**
 * Waits for a resource to close, but not for ever: a client whose server is
 * gone may never finish closing, and must not keep the process from stopping.
 */
export async function closeWithin(close: () => Promise<unknown>, ms = 3000): Promise<void> {
  let timer: NodeJS.Timeout | undefined;
  await Promise.race([
    close().catch(() => undefined),
    new Promise((resolve) => {
      timer = setTimeout(resolve, ms);
    }),
  ]);
  clearTimeout(timer);
}
