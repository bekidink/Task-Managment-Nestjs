// src/tasks/tasks.service.ts → FINAL ETHIOPIA ENTERPRISE 2025
import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { FilesService } from '../files/files.service';

@Injectable()
export class TasksService {
  constructor(
    private prisma: PrismaService,
    private noti: NotificationsService,
    private cloudinary: FilesService,
  ) {}

  // CREATE TASK — FULL FEATURES
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
      files?: Express.Multer.File[];
    },
  ) {
    const { files = [], assigneeId, projectId, title, ...rest } = data;

    // 1. Validate project & access
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      include: { team: true, owner: true },
    });

    if (!project) throw new NotFoundException('Project not found');

    const isOwner = project.ownerId === userId;
    const isTeamMember = project.teamId
      ? await this.prisma.teamMember.count({
          where: { teamId: project.teamId, userId },
        })
      : 0;

    if (!isOwner && isTeamMember === 0) {
      throw new ForbiddenException('You do not have access to this project');
    }

    // 2. Upload files to Cloudinary
    const uploadedFiles = await Promise.all(
      files.map((file) => this.cloudinary.uploadFile(file, 'task', userId)),
    );

    // 3. Create task
    const task = await this.prisma.task.create({
      data: {
        title,
        status: rest.status || 'TODO',
        priority: rest.priority || 'MEDIUM',
        startDate: rest.startDate ? new Date(rest.startDate) : null,
        endDate: rest.endDate ? new Date(rest.endDate) : null,
        description: rest.description,
        projectId,
        assigneeId: assigneeId || null,
        createdBy: userId,
        files:
          uploadedFiles.length > 0
            ? {
                create: uploadedFiles.map((f) => ({
                  url: f.url,
                  name: f.name,
                  size: f.size,
                  mimeType: f.mimeType,
                  uploadedBy: userId,
                })),
              }
            : undefined,
      },
      include: {
        assignee: { select: { id: true, name: true, avatar: true } },
        creator: { select: { id: true, name: true, avatar: true } },
        project: {
          select: { id: true, name: true, team: { select: { name: true } } },
        },
        files: true,
        comments: {
          include: { author: true },
          orderBy: { createdAt: 'desc' },
          take: 3,
        },
        _count: { select: { comments: true } },
      },
    });

    // 4. Send notification if assigned
    if (assigneeId && assigneeId !== userId) {
      await this.noti.send(
        assigneeId,
        'New Task Assigned',
        `You have been assigned: "${title}"`,
        { taskId: task.id, type: 'TASK_ASSIGNED' },
        'TASK_ASSIGNED',
      );
    }

    return task;
  }
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
  // GET ALL MY TASKS (Assigned + Created)
  async getMyTasks(
    userId: string,
    filters?: {
      status?: string;
      projectId?: string;
      search?: string;
    },
  ) {
    const where: any = {
      OR: [{ assigneeId: userId }, { createdBy: userId }],
    };

    if (filters?.status) where.status = filters.status;
    if (filters?.projectId) where.projectId = filters.projectId;
    if (filters?.search) {
      where.OR.push(
        { title: { contains: filters.search, mode: 'insensitive' } },
        { description: { contains: filters.search, mode: 'insensitive' } },
      );
    }

    return this.prisma.task.findMany({
      where,
      include: {
        assignee: { select: { id: true, name: true, avatar: true } },
        creator: { select: { name: true, avatar: true } },
        project: { select: { name: true } },
        files: { take: 1 },
        _count: { select: { comments: true } },
      },
      orderBy: { updatedAt: 'desc' },
      take: 50,
    });
  }

  // GET TASK BY ID — FULL DETAILS
  async findOne(id: string, userId: string) {
    const task = await this.prisma.task.findUnique({
      where: { id },
      include: {
        assignee: true,
        creator: true,
        project: { include: { team: true } },
        files: true,
        comments: {
          include: {
            author: { select: { id: true, name: true, avatar: true } },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!task) throw new NotFoundException();

    const allowed =
      task.assigneeId === userId ||
      task.createdBy === userId ||
      (task.project.teamId &&
        (await this.prisma.teamMember.count({
          where: { teamId: task.project.teamId, userId },
        })));

    if (!allowed) throw new ForbiddenException();

    return task;
  }

  // UPDATE TASK
  async update(
    id: string,
    userId: string,
    data: any,
    newFiles?: Express.Multer.File[],
  ) {
    const task = await this.findOne(id, userId); // Reuses permission check

    // Upload new files if provided
    let uploadedFiles: any[] = [];
    if (newFiles && newFiles.length > 0) {
      uploadedFiles = await Promise.all(
        newFiles.map((file) =>
          this.cloudinary.uploadFile(file, 'task', userId),
        ),
      );
    }

    // Prepare update data
    const updateData: any = { ...data };

    // Handle date fields
    if (data.startDate) updateData.startDate = new Date(data.startDate);
    if (data.endDate) updateData.endDate = new Date(data.endDate);

    // Update task with file attachments if new files exist
    const updated = await this.prisma.task.update({
      where: { id },
      data: {
        ...updateData,
        ...(uploadedFiles.length > 0 && {
          files: {
            create: uploadedFiles.map((f) => ({
              url: f.url,
              name: f.name,
              size: f.size,
              mimeType: f.mimeType,
              uploadedBy: userId,
            })),
          },
        }),
      },
      include: {
        assignee: true,
        creator: true,
        files: true,
        comments: {
          include: {
            author: { select: { id: true, name: true, avatar: true } },
          },
          orderBy: { createdAt: 'asc' },
        },
        project: true,
      },
    });

    // Notify on status change
    if (data.status && data.status !== task.status) {
      const message =
        data.status === 'DONE'
          ? `Task completed: "${task.title}"`
          : `Task status changed to ${data.status}`;

      // Notify creator if they're not the one updating
      if (task.createdBy !== userId) {
        await this.noti.send(
          task.createdBy,
          'Task Update',
          message,
          { taskId: task.id, type: 'TASK_UPDATED' },
          'MENTION',
        );
      }

      // Notify assignee if status changed and they're not the one updating
      if (task.assigneeId && task.assigneeId !== userId) {
        await this.noti.send(
          task.assigneeId,
          'Task Update',
          message,
          { taskId: task.id, type: 'TASK_UPDATED' },
          'COMMENT',
        );
      }
    }

    // Notify on assignee change
    if (data.assigneeId && data.assigneeId !== task.assigneeId) {
      const newAssigneeMessage = `You have been assigned to task: "${task.title}"`;
      const previousAssigneeMessage = `You have been unassigned from task: "${task.title}"`;

      // Notify new assignee
      if (data.assigneeId !== userId) {
        await this.noti.send(
          data.assigneeId,
          'New Task Assignment',
          newAssigneeMessage,
          { taskId: task.id, type: 'TASK_ASSIGNED' },
          'TASK_ASSIGNED',
        );
      }

      // Notify previous assignee if they exist and it's not the same user
      if (
        task.assigneeId &&
        task.assigneeId !== userId &&
        task.assigneeId !== data.assigneeId
      ) {
        await this.noti.send(
          task.assigneeId,
          'Task Assignment Removed',
          previousAssigneeMessage,
          { taskId: task.id, type: 'TASK_UNASSIGNED' },
          'TASK_ASSIGNED',
        );
      }
    }

    // Notify on priority change
    if (data.priority && data.priority !== task.priority) {
      const priorityMessage = `Task priority changed to ${data.priority}: "${task.title}"`;

      // Notify assignee if they exist
      if (task.assigneeId && task.assigneeId !== userId) {
        await this.noti.send(
          task.assigneeId,
          'Task Priority Changed',
          priorityMessage,
          { taskId: task.id, type: 'TASK_PRIORITY_CHANGED' },
          'TASK_ASSIGNED',
        );
      }

      // Notify creator if they're not the one updating
      if (task.createdBy !== userId) {
        await this.noti.send(
          task.createdBy,
          'Task Priority Changed',
          priorityMessage,
          { taskId: task.id, type: 'TASK_PRIORITY_CHANGED' },
          'DONE',
        );
      }
    }

    return updated;
  }

  // DELETE TASK FILE
  async deleteFile(taskId: string, fileId: string, userId: string) {
    const task = await this.findOne(taskId, userId);

    // Check if file exists and belongs to task
    const file = await this.prisma.file.findFirst({
      where: {
        id: fileId,
        taskId: taskId,
      },
    });

    if (!file) {
      throw new NotFoundException(
        'File not found or does not belong to this task',
      );
    }

    // Check permissions (creator, assignee, or team admin)
    const isCreator = task.createdBy === userId;
    const isAssignee = task.assigneeId === userId;
    const isTeamAdmin = task.project.teamId
      ? await this.prisma.teamMember.findFirst({
          where: {
            teamId: task.project.teamId,
            userId,
            role: { in: ['admin', 'manager'] },
          },
        })
      : null;

    if (!isCreator && !isAssignee && !isTeamAdmin) {
      throw new ForbiddenException(
        'You do not have permission to delete this file',
      );
    }

    // Delete from Cloudinary
    await this.cloudinary.deleteFile(file.url);

    // Delete from database
    await this.prisma.file.delete({
      where: { id: fileId },
    });

    return { success: true, message: 'File deleted successfully' };
  }

  // GET TASK FILES
  async getTaskFiles(taskId: string, userId: string) {
    const task = await this.findOne(taskId, userId); // This validates access

    return this.prisma.file.findMany({
      where: { taskId },
      orderBy: { createdAt: 'desc' },
    });
  }

  // DELETE TASK
  async remove(id: string, userId: string) {
    const task = await this.findOne(id, userId);

    const isAdmin = task.project.teamId
      ? await this.prisma.teamMember.findFirst({
          where: {
            teamId: task.project.teamId,
            userId,
            role: { in: ['admin', 'manager'] },
          },
        })
      : null;

    if (task.createdBy !== userId && !isAdmin) {
      throw new ForbiddenException('Only creator or admin can delete');
    }

    await this.prisma.task.delete({ where: { id } });
    return { success: true };
  }

  // ADD COMMENT + MENTIONS
  async addComment(
    taskId: string,
    userId: string,
    content: string,
    mentions: string[] = [],
  ) {
    const task = await this.findOne(taskId, userId);

    const comment = await this.prisma.taskComment.create({
      data: {
        content,
        taskId,
        authorId: userId,
        mentions,
      },
      include: {
        author: { select: { id: true, name: true, avatar: true } },
      },
    });

    // Notify mentioned users
    for (const mentionedId of mentions) {
      if (mentionedId !== userId) {
        await this.noti.send(
          mentionedId,
          'Mentioned in Task',
          `You were mentioned in "${task.title}"`,
          { taskId, type: 'MENTION' },
          'MENTION',
        );
      }
    }

    return comment;
  }

  // MY ASSIGNED TASKS
  async findAssignedToMe(userId: string) {
    return this.prisma.task.findMany({
      where: { assigneeId: userId },
      include: {
        project: { select: { name: true } },
        creator: { select: { name: true } },
        files: { take: 1 },
        _count: { select: { comments: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  // MY CREATED TASKS
  async findCreatedByMe(userId: string) {
    return this.prisma.task.findMany({
      where: { createdBy: userId },
      include: {
        assignee: true,
        project: { select: { name: true } },
        files: { take: 1 },
        _count: { select: { comments: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }
  
  async bulkUpdate(
    userId: string,
    taskIds: string[],
    updates: Partial<{
      status: 'TODO' | 'IN_PROGRESS' | 'DONE';
      priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
      assigneeId: string | null;
    }>,
  ) {
    // Verify user has access to all tasks
    for (const taskId of taskIds) {
      await this.findOne(taskId, userId);
    }

    const updatedTasks = await Promise.all(
      taskIds.map((id) =>
        this.prisma.task.update({
          where: { id },
          data: updates,
          include: {
            assignee: { select: { id: true, name: true, avatar: true } },
            creator: { select: { name: true, avatar: true } },
          },
        }),
      ),
    );

    return updatedTasks;
  }
}
