# Examples

This directory contains examples of how to use Yorkie in various libraries and frameworks.

## Usage

All examples need to run the Yorkie server. So you should run the server before running examples.

```bash
# In the root directory of the repository.
$ docker compose -f docker/docker-compose.yml up --build -d
```

The examples have own local dependencies. So you should install dependencies before running examples.

```bash
# In the root directory of the repository.
$ pnpm install
```

Then you can run the examples.

```bash
# In the root directory of the repository.
$ pnpm <EXAMPLE-NAME> dev

# Or in the directory of the example.
$ pnpm dev
```

Open the browser and go to the URL that is printed in the terminal.

## Releasing an example to https://yorkie.dev

To release an example, the example should export static files to `./dist` directory when running `pnpm <EXAMPLE-NAME> build` in the root directory of the repository or `pnpm build` in the directory of the example.

After the example is merged to the `main` branch, it is automatically deployed to https://yorkie.dev/yorkie-js-sdk/examples/{EXAMPLE-NAME}.
