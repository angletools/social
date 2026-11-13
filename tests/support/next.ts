let token: string | null = null;
export function setSession(value: string | null) { token = value; }
export async function cookies() { return { get: (name: string) => name === "rasd_session" && token ? { value: token } : undefined, set() {}, delete() {} }; }
export async function headers() { return { get: () => null }; }
export function revalidatePath() {}
export function redirect(url: string): never { throw new Error(`REDIRECT:${url}`); }
