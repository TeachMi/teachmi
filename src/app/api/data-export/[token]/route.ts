import { NextResponse } from "next/server";
import {
  consumeTokenAndBuildExport,
  dataExportFilename,
} from "@/lib/data-export/data-export";

interface DataExportRouteContext {
  params: Promise<{ token: string }>;
}

export async function GET(_request: Request, context: DataExportRouteContext) {
  const { token } = await context.params;
  const result = await consumeTokenAndBuildExport(token);

  if (!result.ok) {
    return NextResponse.json(
      { error: "קישור ההורדה אינו תקף או שפג תוקפו." },
      { status: 410 },
    );
  }

  const body = JSON.stringify(result.body, null, 2);

  return new Response(body, {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="${dataExportFilename(result.userId)}"`,
      "cache-control": "no-store",
    },
  });
}
