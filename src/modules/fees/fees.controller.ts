import { createFeeSchema, idParamSchema, updateFeeSchema } from '@bareeq/shared';

import { handle } from '../../lib/http.js';

import { feesService } from './fees.service.js';

export const feesController = {
  studentFees: handle({ params: idParamSchema }, ({ user, params }) =>
    feesService.studentFees(user, params.id),
  ),

  create: handle({ body: createFeeSchema }, ({ user, body }) => feesService.create(user, body), {
    status: 201,
  }),

  update: handle({ params: idParamSchema, body: updateFeeSchema }, ({ user, params, body }) =>
    feesService.update(user, params.id, body),
  ),
};
