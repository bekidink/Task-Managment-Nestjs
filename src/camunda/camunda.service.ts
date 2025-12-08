// src/camunda/camunda.service.ts → CORRECT 2025 VERSION
import { Injectable, OnModuleInit } from '@nestjs/common';
import { Camunda8 } from '@camunda8/sdk';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class CamundaService implements OnModuleInit {
  private camunda: Camunda8;
  private zeebeGrpcClient: any; // Zeebe gRPC client

  constructor() {
    const config = {
      ZEEBE_GRPC_ADDRESS: process.env.CAMUNDA_GATEWAY || 'localhost:26500',
      CAMUNDA_OAUTH_CLIENT_ID: process.env.CAMUNDA_CLIENT_ID,
      CAMUNDA_OAUTH_CLIENT_SECRET: process.env.CAMUNDA_CLIENT_SECRET,
      CAMUNDA_OAUTH_AUDIENCE: process.env.CAMUNDA_AUDIENCE,
      CAMUNDA_OAUTH_URL:
        process.env.CAMUNDA_OAUTH_URL ||
        'https://login.cloud.camunda.io/oauth/token',
    };

    this.camunda = new Camunda8(config);
    this.zeebeGrpcClient = this.camunda.getZeebeGrpcApiClient();
  }

  async onModuleInit() {
    console.log('Camunda 8 connecting...');
    await this.deployAllBpmn();
    console.log('Camunda 8 ready!');
  }

  private async deployAllBpmn() {
    const bpmnDir = path.join(__dirname, '..', '..', 'bpmn');
    if (!fs.existsSync(bpmnDir)) return;

    const files = fs.readdirSync(bpmnDir).filter((f) => f.endsWith('.bpmn'));

    for (const file of files) {
      const filePath = path.join(bpmnDir, file);
      const bpmnXml = fs.readFileSync(filePath, 'utf-8');

      try {
        const result = await this.zeebeGrpcClient.deployProcess({
          definition: bpmnXml,
          name: file,
        });
        console.log(`Deployed: ${file} → Key: ${result.key}`);
      } catch (error: any) {
        if (error.message?.includes('already exists')) {
          console.log(`Already deployed: ${file}`);
        } else {
          console.error(`Failed to deploy ${file}:`, error.message);
        }
      }
    }
  }

  // Start process instance (CORRECT WAY)
  async startProcess(processId: string, variables: Record<string, any>) {
    const result = await this.zeebeGrpcClient
      .newCreateProcessInstanceCommand()
      .bpmnProcessId(processId)
      .variables(variables)
      .send();

    return { processInstanceKey: result.processInstanceKey };
  }

  // Complete user task (CORRECT WAY)
  async completeTask(jobKey: string, variables: Record<string, any> = {}) {
    await this.zeebeGrpcClient
      .newCompleteJobCommand(jobKey)
      .variables(variables)
      .send();
  }

  // Get pending tasks for user (CORRECT WAY)
  async getPendingTasks(userId: string) {
    const jobs = await this.zeebeGrpcClient
      .newActivateJobsCommand({
        type: 'user-task',
        workerName: 'tasker-backend',
        maxJobsToActivate: 10,
      })
      .send();

    return jobs.jobs.filter((job) => job.variables.assignee === userId);
  }
}
