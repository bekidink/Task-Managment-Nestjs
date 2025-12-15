// src/camunda/camunda.service.ts → UPDATED FOR CAMUNDA 8.8+ TYPE SCRIPT SDK
import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { Camunda8 } from '@camunda8/sdk';
import * as fs from 'fs';
import * as path from 'path';
import type {
  
  OrchestrationLifters,
  
  
} from '@camunda8/sdk'; // Types for intellisense

@Injectable()
export class CamundaService implements OnModuleInit {
  private readonly logger = new Logger(CamundaService.name);
  private clientFactory: Camunda8;
  private orchestrationClient: any; // Orchestration Cluster API client

  constructor() {
    // Zero-config: Reads from env vars (ZEEBE_GRPC_ADDRESS, ZEEBE_CLIENT_ID, etc.)
    this.clientFactory = new Camunda8();
    this.orchestrationClient =
      this.clientFactory.getOrchestrationClusterApiClient();
  }

  async onModuleInit() {
    this.logger.log('Camunda 8 connecting...');
    await this.deployAllBpmn();
    this.logger.log('Camunda 8 ready!');
  }

  /**
   * Deploy all BPMN files from /bpmn folder (SDK example)
   */
  private async deployAllBpmn() {
    const bpmnDir = path.join(__dirname, '..', '..', 'bpmn');
    if (!fs.existsSync(bpmnDir)) {
      this.logger.warn(`No BPMN folder found at: ${bpmnDir}`);
      return;
    }

    const files = fs.readdirSync(bpmnDir).filter((f) => f.endsWith('.bpmn'));
    if (files.length === 0) {
      this.logger.warn('No .bpmn files found in /bpmn');
      return;
    }

    for (const file of files) {
      const filePath = path.join(bpmnDir, file);
      const bpmnXml = fs.readFileSync(filePath, 'utf-8');

      try {
        // SDK deploy from string (official example)
        const deployResponse =
          await this.orchestrationClient.deployResourcesFromString({
            resources: [{ name: file, content: bpmnXml, type: 'bpmn' }],
          });

        const processId = deployResponse.processes[0]?.processDefinitionId;
        this.logger.log(`Deployed: ${file} → Process ID: ${processId}`);
      } catch (error: any) {
        if (error.message?.includes('already exists')) {
          this.logger.log(`Already deployed: ${file}`);
        } else {
          this.logger.error(`Failed to deploy ${file}:`, error.message);
        }
      }
    }
  }

  /**
   * Start process instance (SDK example: createProcessInstance)
   */
  async startProcess(processId: string, variables: Record<string, any> = {}) {
    try {
      // Use createProcessInstance for long-running (no awaitCompletion)
      const result =
        await this.orchestrationClient.createProcessInstance({
          processDefinitionId: processId, // e.g., 'TaskApprovalProcess'
          variables, // e.g., { assigneeId: 'user123', title: 'Design Dashboard' }
        });

      this.logger.log(`Started process instance: ${result.processInstanceKey}`);
      return { processInstanceKey: result.processInstanceKey };
    } catch (error: any) {
      this.logger.error('Failed to start process:', error.message);
      throw new Error(`Process start failed: ${error.message}`);
    }
  }

  /**
   * Complete user task (via completeUserTask)
   */
  async completeTask(
    userTaskKey: OrchestrationLifters.UserTaskKey,
    variables: Record<string, any> = {},
  ) {
    try {
      await this.orchestrationClient.completeUserTask({
        userTaskKey,
        variables, // e.g., { decision: 'approve', comment: 'Looks good!' }
      });
      this.logger.log(`Completed user task: ${userTaskKey}`);
    } catch (error: any) {
      this.logger.error('Failed to complete task:', error.message);
      throw new Error(`Task completion failed: ${error.message}`);
    }
  }

  /**
   * Get pending tasks for user (via searchUserTasks with polling)
   */
  async getPendingTasks(assigneeId: string) {
    try {
      // SDK example: Search user tasks with polling (waitUpToMs for consistency)
      const results = await this.orchestrationClient.searchUserTasks(
        {
          filter: {
            assignee: assigneeId,
            state: 'CREATED', // Pending tasks
          },
        },
        {
          consistency: { waitUpToMs: 5000 }, // Wait up to 5s for fresh data
        },
      );

      // Filter and map to your format
      const pendingTasks = results.items.map((task) => ({
        userTaskKey: task.userTaskKey,
        taskId: task.variables.taskId,
        title: task.variables.title,
        project: task.variables.projectName,
        priority: task.variables.priority,
        dueDate: task.variables.dueDate,
        requester: task.variables.requesterId,
      }));

      return pendingTasks;
    } catch (error: any) {
      this.logger.error('Failed to fetch pending tasks:', error.message);
      return [];
    }
  }

  /**
   * Optional: Create a job worker for service tasks (SDK example)
   */
  createJobWorker(jobType: string, handler: (job: any) => Promise<void>) {
    const worker = this.orchestrationClient.createJobWorker({
      jobType,
      workerName: 'tasker-backend',
      maxParallelJobs: 10,
      jobHandler: async (job) => {
        try {
          await handler(job);
          job.complete({ serviceTaskOutcome: 'Success' });
        } catch (err) {
          job.fail({ retries: job.retries - 1, errorMessage: err.message });
        }
      },
    });

    this.logger.log(`Job worker started for type: ${jobType}`);
    return worker;
  }
}
