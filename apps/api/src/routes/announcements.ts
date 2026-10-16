import { Router } from "express";
import { connectDatabase } from "../db.js";
import { Announcement } from "../models/announcement.js";

export const announcementsRouter = Router();

announcementsRouter.get("/", async (_request, response, next) => {
  try {
    await connectDatabase();
    const announcements = await Announcement.find({ status: "published" })
      .select("title message publishedAt")
      .sort({ publishedAt: -1, createdAt: -1 })
      .limit(5)
      .lean();
    response.json({ data: announcements });
  } catch (error) { next(error); }
});
