import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class TasksService {
  constructor(
    private prisma: PrismaService,
    private noti: NotificationsService,
  ) {}

  // CREATE Task
  async create(
    userId: string,
    data: {
      title: string;
      description?: string;
      status?: 'TODO' | 'IN_PROGRESS' | 'DONE';
      priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
      startDate?: string;
      endDate?: string;
      projectId: string;
      assigneeId?: string;
    },
  ) {
    const project = await this.prisma.project.findUnique({
      where: { id: data.projectId },
      include: { team: true },
    });

    if (!project) throw new NotFoundException('Project not found');

    const isMember = await this.prisma.teamMember.count({
      where: { teamId: project.teamId!, userId },
    });

    if (!isMember) throw new ForbiddenException('You are not in this team');

    const task = await this.prisma.task.create({
      data: {
        title: data.title,
        description: data.description,
        status: data.status || 'TODO',
        priority: data.priority || 'MEDIUM',
        startDate: data.startDate ? new Date(data.startDate) : null,
        endDate: data.endDate ? new Date(data.endDate) : null,
        projectId: data.projectId,
        assigneeId: data.assigneeId || null,
        createdBy: userId,
      },
      include: {
        assignee: { select: { id: true, name: true, avatar: true } },
        project: { include: { team: true } },
        comments: { include: { author: true } },
        files: true,
      },
    });

    // Send push notification if assigned
    if (data.assigneeId && data.assigneeId !== userId) {
      await this.noti.send(
        data.assigneeId,
        'New Task Assigned',
        `${task.title} – assigned by `,
        { taskId: task.id, type: 'TASK_ASSIGNED' },
        'TASK_ASSIGNED',
      );
    }

    return task;
  }

  // GET tasks by project
  async findByProject(projectId: string, userId: string) {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      include: { team: true },
    });

    if (!project) throw new NotFoundException('Project not found');

    const isMember = await this.prisma.teamMember.count({
      where: { teamId: project.teamId!, userId },
    });

    if (!isMember) throw new ForbiddenException('Access denied');

    return this.prisma.task.findMany({
      where: { projectId },
      include: {
        assignee: { select: { id: true, name: true, avatar: true } },
        comments: { include: { author: true }, orderBy: { createdAt: 'asc' } },
        files: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  // GET single task
  async findOne(id: string, userId: string) {
    const task = await this.prisma.task.findUnique({
      where: { id },
      include: {
        assignee: true,
        project: { include: { team: true } },
        comments: {
          include: {
            author: { select: { id: true, name: true, avatar: true } },
          },
          orderBy: { createdAt: 'asc' },
        },
        files: true,
      },
    });

    if (!task) throw new NotFoundException('Task not found');

    const isMember = await this.prisma.teamMember.count({
      where: { teamId: task.project.teamId!, userId },
    });

    if (!isMember) throw new ForbiddenException('Access denied');

    return task;
  }

  // UPDATE task (status, assignee, etc.)
  async update(id: string, userId: string, data: any) {
    const task = await this.prisma.task.findUnique({
      where: { id },
      include: { project: { include: { team: true } } },
    });

    if (!task) throw new NotFoundException('Task not found');

    const isMember = await this.prisma.teamMember.count({
      where: { teamId: task.project.teamId!, userId },
    });

    if (!isMember) throw new ForbiddenException('Access denied');

    const updated = await this.prisma.task.update({
      where: { id },
      data,
      include: { assignee: true, comments: true, files: true },
    });

    // Notify if status changed to DONE
    if (data.status === 'DONE' && task.status !== 'DONE') {
      await this.noti.send(
        task.assigneeId || userId,
        'Task Completed!',
        `${task.title} – assigned by ${task.project?.team?.name}`,
        `${updated.title} is now DONE`,
        'DONE',
      );
    }

    return updated;
  }

  // DELETE task
  async remove(id: string, userId: string) {
    const task = await this.prisma.task.findUnique({
      where: { id },
      include: { project: { include: { team: true } } },
    });

    if (!task) throw new NotFoundException('Task not found');

    const isAdmin = await this.prisma.teamMember.findFirst({
      where: {
        teamId: task.project.teamId!,
        userId,
        role: { in: ['admin', 'manager'] },
      },
    });

    if (!isAdmin)
      throw new ForbiddenException('Only admin/manager can delete tasks');

    return this.prisma.task.delete({ where: { id } });
  }

  // ADD COMMENT
  async addComment(
    taskId: string,
    userId: string,
    content: string,
    mentions: string[] = [],
  ) {
    const task = await this.prisma.task.findUnique({ where: { id: taskId } });
    if (!task) throw new NotFoundException('Task not found');

    const comment = await this.prisma.taskComment.create({
      data: { taskId, authorId: userId, content, mentions },
      include: { author: { select: { name: true, avatar: true } } },
    });

    // Notify mentioned users
    for (const userId of mentions) {
      await this.noti.send(
        userId,
        'Mentioned in Task',
        `${task.title} – assigned `,
        `You were mentioned in "${task.title}"`,
        'MENTION',
      );
    }

    return comment;
  }
  // In TasksService
  async findAssignedToMe(userId: string) {
    return this.prisma.task.findMany({
      where: { assigneeId: userId },
      include: {
        assignee: { select: { id: true, name: true, avatar: true } },
        project: { select: { id: true, name: true } },
        comments: { include: { author: true }, orderBy: { createdAt: 'desc' } },
        files: true,
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async findCreatedByMe(userId: string) {
    return this.prisma.task.findMany({
      where: { createdBy: userId },
      include: {
        assignee: { select: { id: true, name: true, avatar: true } },
        project: { select: { id: true, name: true } },
        comments: { include: { author: true }, orderBy: { createdAt: 'desc' } },
        files: true,
      },
      orderBy: { updatedAt: 'desc' },
    });
  }
}
