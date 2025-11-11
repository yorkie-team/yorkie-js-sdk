export async function POST(request: Request) {
  try {
    // Check if secret key is available (required for admin API)
    const secretKey = process.env.YORKIE_API_SECRET_KEY;
    if (!secretKey) {
      return Response.json(
        { error: 'API server features not available in static hosting mode' },
        { status: 503 },
      );
    }

    const { channel_keys, include_presence } = await request.json();

    const url = `${process.env.NEXT_PUBLIC_YORKIE_API_ADDR}/yorkie.v1.AdminService/GetChannels`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `API-Key ${secretKey}`,
      },
      body: JSON.stringify({
        channel_keys,
        include_presence,
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch channels: ${response.statusText}`);
    }

    const data = await response.json();
    return Response.json(data);
  } catch (error) {
    console.error('Error fetching channels:', error);
    return Response.json(
      { error: 'Failed to fetch channels' },
      { status: 500 },
    );
  }
}
