
alter function public.set_updated_at() set search_path = public;

revoke execute on function public.has_role(uuid, public.app_role) from public, anon;
revoke execute on function public.current_hospital_id() from public, anon;
revoke execute on function public.is_admin_or_manager(uuid) from public, anon;
revoke execute on function public.can_operate_stock(uuid) from public, anon;
revoke execute on function public.handle_new_user() from public, anon;

grant execute on function public.has_role(uuid, public.app_role) to authenticated, service_role;
grant execute on function public.current_hospital_id() to authenticated, service_role;
grant execute on function public.is_admin_or_manager(uuid) to authenticated, service_role;
grant execute on function public.can_operate_stock(uuid) to authenticated, service_role;
