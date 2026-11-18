import { createPaymentSchema, idParamSchema, voidPaymentSchema } from '@bareeq/shared';

import { handle } from '../../lib/http.js';

import { paymentsService } from './payments.service.js';

export const paymentsController = {
  create: handle(
    { body: createPaymentSchema },
    ({ user, body }) => paymentsService.create(user, body),
    { status: 201 },
  ),

  void: handle({ params: idParamSchema, body: voidPaymentSchema }, ({ user, params, body }) =>
    paymentsService.void(user, params.id, body),
  ),
};
