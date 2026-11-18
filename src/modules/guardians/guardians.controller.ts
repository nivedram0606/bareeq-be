import { createGuardianSchema, idParamSchema, updateGuardianSchema } from '@bareeq/shared';

import { handle } from '../../lib/http.js';

import { guardiansService } from './guardians.service.js';

export const guardiansController = {
  listForStudent: handle({ params: idParamSchema }, ({ user, params }) =>
    guardiansService.list(user, params.id),
  ),

  create: handle(
    { params: idParamSchema, body: createGuardianSchema },
    ({ user, params, body }) => guardiansService.create(user, params.id, body),
    { status: 201 },
  ),

  update: handle({ params: idParamSchema, body: updateGuardianSchema }, ({ user, params, body }) =>
    guardiansService.update(user, params.id, body),
  ),

  remove: handle({ params: idParamSchema }, ({ user, params }) =>
    guardiansService.remove(user, params.id),
  ),
};
