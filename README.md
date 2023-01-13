# Looker Studio Dashboard Cloner (lsd-cloner)

It's an interactive tool for cloning Looker Studio (previously known as Data Studio) dashboards.

The tool asks a series of question and generates a [Linking API]( https://developers.google.com/looker-studio/integrate/linking-api) link, once opened it copies a dashboard with all its datasources.


## Installation

```
npm i -g lsd-cloner
```

## Usage
Once installed globally (with `-g` option) it provides `lsd-cloner` CLI tool. Run it and follow instructions.

Run with pre-polulated answers:
```
lsd-cloner --answers=answers.json
```


save answers into a file:
```
lsd-cloner --save=answers.json
```

You can run it in a non-interactive environment (SSH), just open a generated link manually.


The tool creates a link for cloning a dashboard with data sources backed by BigQuery tables (or views).
When you're cloning a dashboard you need to clone its data sources and retarget them to your own tables in a different project/dataset comparing to where they are for templated dashboard.
So you'll be asked to specify a GCP project id and dataset id (where resulting tables located).
Then for each data sources that the dashboard uses you'll need to supply its alias (go to Edit/ Manage added Data Sources - rightmost column in datasource list displays alias)
and a table name with new data.


## Disclaimer
This is not an officially supported Google product.
