import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';

@Injectable()
export class TasksService {
  constructor(
    private prisma: PrismaService,
    private notificationsService: NotificationsService,
  ) {}

  
  async create(createTaskDto: CreateTaskDto) {
    const {
      assigneeId,
      projectId,
      title,
      description,
      status,
      dueDate,
      // any other fields you added later
    } = createTaskDto;

    const task = await this.prisma.task.create({
      data: {
        title,
        description,
        status,
        dueDate: dueDate ? new Date(dueDate) : undefined,

        // ← MongoDB way – just the IDs (or null)
        assigneeId: assigneeId ?? null,
        projectId: projectId ?? null,
      },
      include: {
        assignee: true,
        project: true,
      },
    });

    // Send notification if someone was assigned
    if (assigneeId) {
      await this.notificationsService.create({
        title: 'New Task Assigned',
        message: `You have been assigned to "${title}"`,
        type: 'TASK_ASSIGNED',
        userId: assigneeId,
        taskId: task.id,
        data: { screen: 'TaskDetail', params: { id: task.id } },
      });
    }

    return task;
  }

  async findAll() {
    return this.prisma.task.findMany({
      include: { assignee: true, project: true },
    });
  }

  async findOne(id: string) {
    return this.prisma.task.findUnique({
      where: { id },
      include: { assignee: true, project: true },
    });
  }

  async update(id: string, updateTaskDto: UpdateTaskDto) {
    const task = await this.prisma.task.update({
      where: { id },
      data: updateTaskDto,
    });

    if (updateTaskDto.status === 'DONE') {
      await this.notificationsService.create({
        title: 'Task Completed',
        message: `The task "${task.title}" has been completed`,
        type: 'TASK_COMPLETED',
        userId: task.assigneeId!, // or owner
        taskId: task.id,
      });
    }

    return task;
  }

  async remove(id: string) {
    return this.prisma.task.delete({ where: { id } });
  }
}
