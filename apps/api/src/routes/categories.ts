import { Router } from "express";
import { Category } from "../models/category.js";
import { Film } from "../models/film.js";
import { connectDatabase } from "../db.js";
import { categoryFilmFilter } from "../category-filter.js";

export const categoriesRouter = Router();

categoriesRouter.get("/", async (_request, response, next) => {
  try {
    await connectDatabase();
    const categories = await Category.find({ isVisible: true })
      .sort({ displayOrder: 1, name: 1 })
      .lean();

    const categoriesWithCount = await Promise.all(categories.map(async cat => ({
      ...cat,
      filmCount: await Film.countDocuments(categoryFilmFilter(cat)),
    })));

    response.json({ data: categoriesWithCount });
  } catch (error) {
    next(error);
  }
});

categoriesRouter.get("/:slug", async (request, response, next) => {
  try {
    await connectDatabase();
    const category = await Category.findOne({
      slug: request.params.slug,
      isVisible: true,
    }).lean();

    if (!category) {
      response.status(404).json({ error: "Category not found" });
      return;
    }

    const films = await Film.find(categoryFilmFilter(category))
      .select("title slug synopsis tagline posterUrl backdropUrl releaseYear runtimeMinutes genres directorNames audienceScore")
      .sort({ createdAt: -1 })
      .limit(30)
      .lean();

    response.json({ data: { category, films } });
  } catch (error) {
    next(error);
  }
});

