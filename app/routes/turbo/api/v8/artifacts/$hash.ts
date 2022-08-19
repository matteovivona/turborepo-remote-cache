import type { ActionFunction, LoaderFunction } from '@remix-run/node';
import { Readable } from 'stream';
import { CacheStorage } from '~/services/storage.server';
import { DURATION_HEADER, getTurboContext } from '~/utils/turboContext';
import { requireCookieAuth, requireTokenAuth } from '~/services/authentication.server';
import { getTeamFromRequest } from '~/services/teams.server';
import { allowMethods, METHOD } from '~/utils/method';
import { accepted, unprocessableEntity, internalServerError, notFound } from '~/utils/response';
import { getArtifactDuration, getArtifactId, hitArtifact, insertArtifact } from '~/services/artifact.server';
import type { User } from '@prisma/client';

export const loader: LoaderFunction = async ({ request, params, context }) => {
  allowMethods(request, METHOD.GET, METHOD.PUT);
  let user: User;
  try {
    user = await requireTokenAuth(request);
  } catch (e) {
    user = await requireCookieAuth(request, false);
  }
  const team = await getTeamFromRequest(request);
  const turboCtx = getTurboContext({ request, params, context }, user, team);

  const storage = new CacheStorage();
  if (!(await storage.existArtifact(turboCtx))) {
    throw notFound();
  }
  await hitArtifact(getArtifactId(turboCtx));
  const artifactDuration = await getArtifactDuration(getArtifactId(turboCtx));
  const headers = new Headers();
  headers.set('Content-Type', 'application/octet-stream');
  headers.set(DURATION_HEADER, artifactDuration.toString());
  // Cast as ReadableStream because Response actually accept Readable as BodyInit
  return new Response((await storage.readArtifact(turboCtx)) as unknown as ReadableStream, {
    status: 200,
    headers,
  });
};

export const action: ActionFunction = async ({ request, params, context }) => {
  allowMethods(request, METHOD.GET, METHOD.PUT);
  const user = await requireTokenAuth(request);
  const team = await getTeamFromRequest(request);
  const turboCtx = getTurboContext({ request, params, context }, user, team);

  if (!request.body) {
    throw unprocessableEntity();
  }

  const storage = new CacheStorage();
  const contentLength = Number.parseInt(request.headers.get('Content-Length') as string);
  try {
    await Promise.all([
      // The real type of request.body is ReadableStream. Somehow ReadableStream can be used as AsyncIterator
      storage.writeArtifact(turboCtx, Readable.from(request.body as unknown as AsyncIterable<any>)),
      insertArtifact({
        id: getArtifactId(turboCtx),
        hash: turboCtx.hash!,
        duration: turboCtx.duration!,
        contentLength,
        teamId: turboCtx.team?.id ?? null,
        userId: turboCtx.user.id,
      }),
    ]);
  } catch (err) {
    console.error(err);
    throw internalServerError();
  }
  return accepted();
};
