import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';

@Injectable()
export class ProjectsService {
  constructor(private prisma: PrismaService) {}

  async create(createProjectDto: CreateProjectDto, ownerId: string) {
    return this.prisma.project.create({
      data: {
        ...createProjectDto,
        owner: { connect: { id: ownerId } },
      },
      include: { owner: true, tasks: true },
    });
  }

  async findAll() {
    return this.prisma.project.findMany({
      include: { owner: true, tasks: { include: { assignee: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    return this.prisma.project.findUnique({
      where: { id },
      include: { owner: true, tasks: { include: { assignee: true } } },
    });
  }

  async update(id: string, updateProjectDto: UpdateProjectDto) {
    return this.prisma.project.update({
      where: { id },
      data: updateProjectDto,
      include: { owner: true, tasks: true },
    });
  }

  async remove(id: string) {
    return this.prisma.project.delete({ where: { id } });
  }
}
