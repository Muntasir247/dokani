/**
 * Type-safe RPC invocation helper that cleanly adapts parameter records
 * without triggering strict PostgREST generic mismatch.
 */
export async function callRpc<T = unknown>(
  client: unknown,
  fnName: string,
  params: Record<string, unknown>
): Promise<{ data: T | null; error: { message: string } | null }> {
  type RpcClient = {
    rpc: (
      fn: string,
      args: Record<string, unknown>
    ) => Promise<{ data: T | null; error: { message: string } | null }>;
  };

  const rpcCaller = client as RpcClient;
  return rpcCaller.rpc(fnName, params);
}
