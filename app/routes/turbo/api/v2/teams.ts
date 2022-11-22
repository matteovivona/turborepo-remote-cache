import type { LoaderFunction } from '@remix-run/node';
import { json } from '@remix-run/node';
import { ToVercelTeam } from '~/mapper/team';
import { requireTokenAuth } from '~/services/authentication.server';
import { getUserTeams } from '~/services/teams.server';
import { allowMethods, METHOD } from '~/utils/method';

export const loader: LoaderFunction = async ({ request }) => {
  allowMethods(request, METHOD.GET);
  const user = await requireTokenAuth(request);
  const teams = await getUserTeams(user.id, 100);
  return json({
    teams: teams.map(ToVercelTeam),
    pagination: {
      count: 0,
      next: 0,
      prev: 0,
    },
  });
};
