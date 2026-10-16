import { Router } from "express";
import { Director } from "../models/director.js";
import { Film } from "../models/film.js";
import { connectDatabase } from "../db.js";

export const directorsRouter = Router();

directorsRouter.get("/", async (_request, response, next) => {
  try {
    await connectDatabase();
    const directors = await Director.find()
      .select("name title slug bio photoUrl displayOrder")
      .sort({ displayOrder: 1, name: 1 })
      .limit(200)
      .lean();
    response.json({ data: directors });
  } catch (error) {
    next(error);
  }
});

directorsRouter.get("/:slug", async (request, response, next) => {
  try {
    await connectDatabase();
    const director = await Director.findOne({ slug: request.params.slug }).lean();
    if (!director) {
      response.status(404).json({ error: "Director not found" });
      return;
    }

    const films = await Film.find({
      status: "published",
      visibility: "public",
      $or: [{ directorNames: director.name }, { directorIds: director._id }],
    })
      .select("title slug synopsis tagline posterUrl backdropUrl releaseYear runtimeMinutes genres directorNames audienceScore")
      .sort({ releaseYear: -1 })
      .lean();

    response.json({ data: { director, films } });
  } catch (error) {
    next(error);
  }
});

