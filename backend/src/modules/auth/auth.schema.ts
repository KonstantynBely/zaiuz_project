export interface LoginBody { username: string; password: string }
export interface PasswordBody { currentPassword: string; newPassword: string }
export const loginSchema = {
  type: 'object', required: ['username','password'], additionalProperties: false,
  properties: { username: {type:'string', minLength:1}, password:{type:'string',minLength:1} },
} as const;
export const passwordSchema = {
  type: 'object', required: ['currentPassword','newPassword'], additionalProperties: false,
  properties: { currentPassword:{type:'string',minLength:1}, newPassword:{type:'string',minLength:8} },
} as const;
