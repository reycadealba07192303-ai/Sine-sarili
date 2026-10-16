import { Router } from "express";
import { Award } from "../models/award.js";
import { connectDatabase } from "../db.js";

export const awardsRouter = Router();

awardsRouter.get("/", async (_request, response, next) => {
  try {
    await connectDatabase();
    const awards = await Award.find()
      .populate("filmId", "title slug posterUrl backdropUrl releaseYear")
      .sort({ year: -1, organization: 1 })
      .limit(100)
      .lean();
    response.json({ data: awards });
  } catch (error) {
    next(error);
  }
});

