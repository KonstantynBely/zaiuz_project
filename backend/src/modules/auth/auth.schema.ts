/** Dane wejściowe logowania administratora; hasło nie jest zapisywane w logach. */
export interface LoginBody { username: string; password: string }
/** Bieżące hasło do weryfikacji i nowe hasło do ustawienia w aktywnej sesji. */
export interface PasswordBody { currentPassword: string; newPassword: string }
/** Schemat walidacji JSON dla logowania. Typy i wymagane pola sprawdza Fastify przed handlerem; reguły domenowe weryfikuje serwis. */
export const loginSchema = {
  type: 'object', required: ['username','password'], additionalProperties: false,
  properties: { username: {type:'string', minLength:1}, password:{type:'string',minLength:1} },
} as const;
/** Schemat walidacji JSON dla zmiany hasła. Typy i wymagane pola sprawdza Fastify przed handlerem; reguły domenowe weryfikuje serwis. */
export const passwordSchema = {
  type: 'object', required: ['currentPassword','newPassword'], additionalProperties: false,
  properties: { currentPassword:{type:'string',minLength:1}, newPassword:{type:'string',minLength:8} },
} as const;
