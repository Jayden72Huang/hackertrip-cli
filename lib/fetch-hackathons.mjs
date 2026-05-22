export async function fetchHackathons(apiUrl) {
  const res = await fetch(`${apiUrl}?limit=50`);

  if (!res.ok) {
    throw new Error(`Failed to fetch hackathons: ${res.status} ${res.statusText}`);
  }

  const data = await res.json();
  return data.hackathons || [];
}
