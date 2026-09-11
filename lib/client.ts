export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { cache: "no-store", ...init });
  const data = await response.json() as { error?: string };
  if (!response.ok) throw new Error(data.error || "Couldn’t complete that action.");
  return data as T;
}
export const jsonBody = (data: unknown) => ({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
