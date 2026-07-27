
revoke all on function public.handle_new_user() from public;
revoke all on function public.update_updated_at_column() from public;
revoke all on function public.has_role(uuid, public.app_role) from public;
revoke all on function public.is_staff(uuid) from public;
grant execute on function public.has_role(uuid, public.app_role) to authenticated;
grant execute on function public.is_staff(uuid) to authenticated;
