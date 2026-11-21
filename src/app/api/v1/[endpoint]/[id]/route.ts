import { handleV1 } from '@/lib/apiV1';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

type Ctx = { params: { endpoint: string; id: string } };

export async function GET(req: Request, ctx: Ctx) { return handleV1(req, [ctx.params.endpoint, ctx.params.id], 'GET'); }
export async function POST(req: Request, ctx: Ctx) { return handleV1(req, [ctx.params.endpoint, ctx.params.id], 'POST'); }
