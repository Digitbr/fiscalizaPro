import crypto from "node:crypto";

const ITERATIONS = 120000;
const KEY_LENGTH = 32;
const DIGEST = "sha256";

export function verifyPassword(password, salt, expectedHash) {
  const actual = crypto.pbkdf2Sync(password, salt, ITERATIONS, KEY_LENGTH, DIGEST).toString("hex");
  const actualBuffer = Buffer.from(actual, "hex");
  const expectedBuffer = Buffer.from(expectedHash, "hex");

  if (actualBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(actualBuffer, expectedBuffer);
}

export function createToken() {
  return crypto.randomBytes(32).toString("hex");
}

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.pbkdf2Sync(password, salt, ITERATIONS, KEY_LENGTH, DIGEST).toString("hex");
  return { salt, hash };
}

export const rolePermissions = {
  ADMIN_OPERACIONAL: ["*"],
  FISCAL_OPERACIONAL: [
    "dashboard:read:own",
    "chatbot:use",
    "employees:read",
    "routes:read:own",
    "routes:execute",
    "occurrences:create",
    "occurrences:read:own",
    "notices:read",
    "attachments:create",
    "reports:read:own"
  ],
  SUPERVISOR_OPERACIONAL: [
    "dashboard:read:area",
    "chatbot:use",
    "employees:read",
    "routes:read:area",
    "occurrences:read:area",
    "occurrences:update",
    "services:read:own",
    "services:update:own",
    "services:create",
    "movements:create",
    "movements:read:area",
    "notices:read",
    "reports:read:area"
  ],
  USUARIO_CONSULTA: [
    "dashboard:read:limited",
    "employees:read",
    "routes:read:limited",
    "occurrences:read:limited",
    "services:read:limited",
    "notices:read",
    "reports:read:limited"
  ]
};

export function can(user, permission) {
  if (!user) {
    return false;
  }

  const permissions = rolePermissions[user.role] ?? [];
  return permissions.includes("*") || permissions.includes(permission);
}

export function canAny(user, permissions) {
  return permissions.some((permission) => can(user, permission));
}

export function publicUser(user) {
  if (!user) {
    return null;
  }

  const { passwordHash, passwordSalt, ...safeUser } = user;
  return {
    ...safeUser,
    permissions: rolePermissions[user.role] ?? []
  };
}
