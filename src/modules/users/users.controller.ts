import {
  createUserSchema,
  idParamSchema,
  listQuerySchema,
  resetUserPasswordSchema,
  updateUserSchema,
} from '@bareeq/shared';

import { handle } from '../../lib/http.js';

import { usersService } from './users.service.js';

export const usersController = {
  me: handle({}, ({ user }) => usersService.me(user)),

  list: handle({ query: listQuerySchema }, ({ user, query }) => usersService.list(user, query)),

  create: handle({ body: createUserSchema }, ({ user, body }) => usersService.create(user, body), {
    status: 201,
  }),

  update: handle({ params: idParamSchema, body: updateUserSchema }, ({ user, params, body }) =>
    usersService.update(user, params.id, body),
  ),

  resetPassword: handle(
    { params: idParamSchema, body: resetUserPasswordSchema },
    ({ user, params, body }) => usersService.resetPassword(user, params.id, body),
  ),
};
