import bcrypt from "bcryptjs";
import type { PrismaClient } from "@prisma/client";
import { config } from "./config";

export async function ensureAdminUser(prisma: PrismaClient) {
  const existingAdmin = await prisma.user.findUnique({
    where: { email: config.admin.email },
    select: { id: true, passwordHash: true },
  });

  const passwordHash = await bcrypt.hash(config.admin.password, 10);

  if (!existingAdmin) {
    await prisma.user.create({
      data: {
        name: config.admin.name,
        email: config.admin.email,
        passwordHash,
        role: "ADMIN",
        status: "ACTIVE",
      },
    });

    return;
  }

  await prisma.user.update({
    where: { email: config.admin.email },
    data: {
      name: config.admin.name,
      role: "ADMIN",
      status: "ACTIVE",
      ...(config.admin.resetPasswordOnBoot ? { passwordHash } : {}),
    },
  });
}
