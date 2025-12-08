// src/dashboard/dashboard.service.ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  subDays,
  format,
} from 'date-fns';

@Injectable()
export class DashboardService {
  constructor(private prisma: PrismaService) {}

  async getMobileDashboard(userId: string) {
    const now = new Date();

    // === WEEKLY BAR CHART (7 days) ===
    const weeklyStart = subDays(now, 6);
    const weeklyTasks = await this.prisma.task.groupBy({
      by: ['createdAt'],
      where: {
        OR: [{ assigneeId: userId }, { createdBy: userId }],
        createdAt: { gte: weeklyStart },
      },
      _count: { _all: true },
    });

    const weeklyData = Array.from({ length: 7 }, (_, i) => {
      const date = subDays(now, 6 - i);
      const dayStr = format(date, 'yyyy-MM-dd');
      const dayTasks = weeklyTasks.find(
        (t) => format(t.createdAt!, 'yyyy-MM-dd') === dayStr,
      );
      const count = dayTasks?._count._all || 0;

      return {
        value: count,
        label: format(date, 'EEE').slice(0, 3), // Mon, Tue...
        frontColor: count >= 20 ? '#FB923C' : '#9333EA', // Orange if high
      };
    });

    // === MONTHLY LINE CHART ===
    const monthStart = startOfMonth(now);
    const monthEnd = endOfMonth(now);
    const monthlyTasks = await this.prisma.task.groupBy({
      by: ['createdAt'],
      where: {
        OR: [{ assigneeId: userId }, { createdBy: userId }],
        createdAt: { gte: monthStart, lte: monthEnd },
      },
      _count: { _all: true },
    });

    const monthlyData = [1, 7, 14, 21, 28].map((day) => {
      const date = new Date(now.getFullYear(), now.getMonth(), day);
      const found = monthlyTasks.find(
        (t) => t.createdAt && t.createdAt.getDate() === day,
      );
      return { value: found?._count._all || 0, label: day.toString() };
    });

    // === MAIN PROJECT CARD ===
    const mainProject = await this.prisma.project.findFirst({
      where: {
        OR: [{ ownerId: userId }, { team: { members: { some: { userId } } } }],
      },
      orderBy: { updatedAt: 'desc' },
      include: {
        tasks: true,
        team: {
          include: {
            members: {
              include: { user: { select: { name: true, avatar: true } } },
              take: 10,
            },
          },
        },
      },
    });

    const projectProgress = mainProject
      ? Math.round(
          (mainProject.tasks.filter((t) => t.status === 'DONE').length /
            mainProject.tasks.length) *
            100 || 0,
        )
      : 0;

    // === RECENTT TASKS ===
    const recentTasks = await this.prisma.task.findMany({
      where: { OR: [{ assigneeId: userId }, { createdBy: userId }] },
      include: { project: { select: { name: true } } },
      orderBy: { updatedAt: 'desc' },
      take: 5,
    });

    // === STATS ===
    const [totalTasks, doneTasks, overdue] = await Promise.all([
      this.prisma.task.count({
        where: { OR: [{ assigneeId: userId }, { createdBy: userId }] },
      }),
      this.prisma.task.count({
        where: {
          OR: [{ assigneeId: userId }, { createdBy: userId }],
          status: 'DONE',
        },
      }),
      this.prisma.task.count({
        where: {
          assigneeId: userId,
          status: { not: 'DONE' },
          endDate: { lt: now },
        },
      }),
    ]);

    return {
      overview: {
        project: mainProject
          ? {
              name: mainProject.name,
              progress: projectProgress,
              totalTasks: mainProject.tasks.length,
              doneTasks: mainProject.tasks.filter((t) => t.status === 'DONE')
                .length,
              members: mainProject.team?.members.map((m) => m.user) || [],
              dateRange:
                mainProject.startDate && mainProject.endDate
                  ? `${format(mainProject.startDate, 'dd/MM/yyyy')} → ${format(mainProject.endDate, 'dd/MM/yyyy')}`
                  : 'No deadline',
            }
          : null,
        recentTasks: recentTasks.map((t) => ({
          id: t.id,
          title: t.title,
          projectName: t.project.name,
          deadline: t.endDate,
        })),
      },
      analytics: {
        weeklyTasks: weeklyData,
        monthlyTasks: monthlyData,
        totalTasksThisMonth: monthlyTasks.reduce(
          (sum, t) => sum + (t._count._all || 0),
          0,
        ),
        overdueTasks: overdue,
      },
      stats: {
        totalTasks,
        doneTasks,
        completionRate:
          totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0,
      },
    };
  }
}
