-- V1.49: Return a bounded, chronological Safety track per active outing.
-- The existing partial association/timestamp indexes support both source scans.
CREATE OR REPLACE FUNCTION public.get_safety_location_points(
  p_reservation_ids uuid[],
  p_private_outing_ids uuid[],
  p_max_points_per_outing integer DEFAULT 90
)
RETURNS TABLE (
  id uuid,
  reservation_id uuid,
  private_outing_id uuid,
  member_id uuid,
  latitude double precision,
  longitude double precision,
  accuracy_meters double precision,
  recorded_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH point_limit AS (
    SELECT GREATEST(1, LEAST(COALESCE(p_max_points_per_outing, 90), 120)) AS value
  ), bounded_points AS (
    SELECT point.id, point.reservation_id, point.private_outing_id, point.member_id,
      point.latitude, point.longitude, point.accuracy_meters, point.recorded_at,
      outing.id AS outing_id
    FROM unnest(COALESCE(p_reservation_ids, ARRAY[]::uuid[])) AS outing(id)
    CROSS JOIN LATERAL (
      SELECT id, reservation_id, private_outing_id, member_id, latitude, longitude, accuracy_meters, recorded_at
      FROM public.rowing_location_points
      WHERE reservation_id = outing.id
      ORDER BY recorded_at DESC
      LIMIT (SELECT value FROM point_limit)
    ) AS point

    UNION ALL

    SELECT point.id, point.reservation_id, point.private_outing_id, point.member_id,
      point.latitude, point.longitude, point.accuracy_meters, point.recorded_at,
      outing.id AS outing_id
    FROM unnest(COALESCE(p_private_outing_ids, ARRAY[]::uuid[])) AS outing(id)
    CROSS JOIN LATERAL (
      SELECT id, reservation_id, private_outing_id, member_id, latitude, longitude, accuracy_meters, recorded_at
      FROM public.rowing_location_points
      WHERE private_outing_id = outing.id
      ORDER BY recorded_at DESC
      LIMIT (SELECT value FROM point_limit)
    ) AS point
  )
  SELECT id, reservation_id, private_outing_id, member_id, latitude, longitude, accuracy_meters, recorded_at
  FROM bounded_points
  ORDER BY outing_id, recorded_at ASC;
$$;

GRANT EXECUTE ON FUNCTION public.get_safety_location_points(uuid[], uuid[], integer) TO authenticated;
