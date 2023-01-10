/* eslint-disable no-process-exit */
/**
 * Copyright 2022 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import * as fs from 'node:fs';
import {execSync, spawn} from 'child_process';
import inquirer, {Answers, QuestionCollection} from 'inquirer';
import inquirerPrompt from 'inquirer-autocomplete-prompt';
import chalk from 'chalk';
import minimist from 'minimist';
import clui from 'clui';
import open from 'open';

inquirer.registerPrompt('autocomplete', inquirerPrompt);

const argv = minimist(process.argv.slice(2));

async function prompt(
  questions: QuestionCollection<Answers>,
  answers?: Partial<any>
) {
  const actual_answers = await inquirer.prompt(questions, answers);
  Object.assign(answers || {}, actual_answers);
  return actual_answers;
}

function format_linking_api_cloning_url(
  report_id: string,
  report_name: string,
  project_id: string,
  dataset_id: string,
  datasources: Record<string, string>
) {
  // https://developers.google.com/looker-studio/integrate/linking-api
  let url = 'https://lookerstudio.google.com/reporting/create?';
  report_name = encodeURIComponent(report_name);
  url += `c.mode=edit&c.reportId=${report_id}&r.reportName=${report_name}&ds.*.refreshFields=false`;
  if (datasources) {
    Object.entries(datasources).map(entries => {
      const alias = entries[0];
      const table = entries[1];
      url +=
        `&ds.${alias}.connector=bigQuery` +
        `&ds.${alias}.datasourceName=${table}` +
        `&ds.${alias}.projectId=${project_id}` +
        `&ds.${alias}.datasetId=${dataset_id}` +
        `&ds.${alias}.type=TABLE` +
        `&ds.${alias}.tableId=${table}`;
    });
  }
  return url;
}

async function ask_for_dashboard_datasources(
  datasources: Record<string, string>
): Promise<Record<string, string>> {
  const idx = Object.keys(datasources).length;
  const questions: QuestionCollection = [
    {
      type: 'input',
      name: 'dashboard_datasource',
      message: `(${idx}) Enter a datasource alias in Looker Studio dashboard:`,
    },
    {
      type: 'input',
      name: 'dashboard_table',
      message: `(${idx}) Enter a BigQuery table id with data for Looker Studio datasource:`,
      when: answers => !!answers.dashboard_datasource,
    },
    {
      type: 'confirm',
      name: 'dashboard_more_tables',
      message: 'Do you want to enter another datasource:',
      default: false,
      when: answers => !!answers.dashboard_datasource,
    },
  ];
  const answers = await prompt(questions);
  if (answers.dashboard_datasource) {
    datasources[answers.dashboard_datasource] = answers.dashboard_table;
  }
  if (answers.dashboard_more_tables) {
    return await ask_for_dashboard_datasources(datasources);
  }
  return datasources;
}

async function create_linking_api_cloning_url(
  answers: Partial<any>,
  project_id: string
) {
  const dash_answers = await prompt(
    [
      {
        type: 'input',
        name: 'dashboard_id',
        message:
          'Looker Studio dashboard id (00000000-0000-0000-0000-000000000000):',
      },
      {
        type: 'input',
        name: 'dashboard_name',
        message: 'Looker Studio dashboard name:',
      },
      {
        type: 'input',
        name: 'dashboard_dataset',
        message: 'BigQuery dataset name for source tables:',
      },
    ],
    answers
  );

  // for cloning datasources we need BQ table-id AND datasource alias in Looker Studio
  // (see https://developers.google.com/looker-studio/integrate/linking-api#data-source-alias)
  let datasources = answers.dashboard_datasources || {};
  if (Object.keys(datasources).length === 0) {
    datasources = await ask_for_dashboard_datasources(datasources);
    answers.dashboard_datasources = datasources;
  }
  const dashboard_url = format_linking_api_cloning_url(
    dash_answers.dashboard_id.trim(),
    dash_answers.dashboard_name.trim(),
    project_id,
    answers.dashboard_dataset,
    datasources
  );
  console.log(
    'Open the following link in the browser for cloning the dashboard:'
  );
  console.log(chalk.cyanBright(dashboard_url));

  return dashboard_url;
}

async function get_gcp_project(answers: Partial<any>) {
  if (answers.project_id) {
    return answers.project_id;
  }

  // check that gcloud CLI intalled
  try {
    execSync('gcloud --version');
  } catch {
    // no gcloud, ask for a project_id without any checks
    const response = await prompt(
      [
        {
          type: 'text',
          name: 'project_id',
          message: 'Please enter a GCP project id:',
        },
      ],
      answers
    );
    return response.project_id.trim();
  }

  // try to detect current GCP project and let the user to use it
  let gcp_project_id = execSync('gcloud config get-value project 2> /dev/null')
    .toString()
    .trim();
  if (gcp_project_id) {
    if (
      (
        await prompt(
          {
            type: 'confirm',
            name: 'use_current_project',
            message: `Detected currect GCP project ${chalk.green(
              gcp_project_id
            )}, do you want to use it (Y) or choose another (N)?:`,
            default: true,
          },
          answers
        )
      ).use_current_project
    ) {
      return gcp_project_id;
    }
  }

  // otherwise let the user to choose a project from a autocomplete list,
  // for this let's load all availble projects to the user
  const spinner = new clui.Spinner('Loading GCP projects');
  spinner.start();
  const cp = spawn(
    'gcloud projects list --format="csv(projectId,name)" --sort-by=projectId --limit=500',
    [],
    {
      shell: true,
      // inherit stdin, and wrap stdout/stderr
      stdio: ['inherit', 'pipe', 'inherit'],
    }
  );
  let projects_csv = '';
  cp.stdout?.on('data', chunk => {
    projects_csv += chunk;
  });
  await new Promise(resolve => {
    cp.on('close', (code: number) => {
      resolve(code);
    });
  });
  spinner.stop();
  const rows = projects_csv
    .split('\n')
    .map(row => row.split(','))
    .filter((val, index) => index !== 0 && !!val[0])
    .map(row => {
      return {
        name: row[0] + (row[1] ? ' (' + row[1] + ')' : ''),
        value: row[0],
      };
    });
  const response = await prompt([
    {
      type: 'autocomplete',
      name: 'project_id',
      message: 'Please enter a GCP project id where your tables located:',
      suggestOnly: true,
      emptyText: 'No projects found',
      validate: input => !!input,
      source: (answersSoFar: Partial<string>, input: string) => {
        if (!input) return rows;
        return rows.filter(
          row => row.name.includes(input) || row.value.includes(input)
        );
      },
    },
  ]);
  // make sure that the entered project does exist
  try {
    execSync(`gcloud projects describe ${response.project_id}`, {
      stdio: 'pipe',
    }).toString();
  } catch {
    console.log(
      chalk.red(
        `The GCP project ${response.project_id} does not exist or you don't have access to it`
      )
    );
  }
  gcp_project_id = response.project_id;
  if (answers) {
    answers.project_id = gcp_project_id;
  }
  return gcp_project_id.trim();
}

async function main() {
  let answers: Partial<any> = {};
  if (argv.answers) {
    answers = JSON.parse(fs.readFileSync(argv.answers, 'utf-8')) || {};
    console.log(`Using answers from '${argv.answers}' file`);
  }
  const project_id = await get_gcp_project(answers);
  const url = await create_linking_api_cloning_url(answers, project_id);
  open(url);

  const saveAnswers = argv.save || argv.saveAnswers;
  if (saveAnswers) {
    const output_file = saveAnswers === true ? 'answers.json' : saveAnswers;
    fs.writeFileSync(output_file, JSON.stringify(answers, null, 2));
    console.log(chalk.gray(`Answers saved into ${output_file}`));
  }
}

main().catch(console.error);
