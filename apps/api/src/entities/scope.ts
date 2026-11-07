/**
 * Constraints shared by Invitation and AccessRole on the scope of a role.
 * The club scope has no activity or team. The activity scope has only the activity. The team scope has the team.
 * The admin always has club scope.
 */
export const CHECK_SCOPE =
  `((scope = 'club' and activity_id is null and team_id is null)` +
  ` or (scope = 'activity' and activity_id is not null and team_id is null)` +
  ` or (scope = 'team' and team_id is not null))`;

export const CHECK_ADMIN_CLUB = `(role <> 'admin' or scope = 'club')`;
