const zookeeper = require("node-zookeeper-client");
const { v4: uuidv4 } = require("uuid");
const assert = require("assert");
const {startSession} = require("mongoose");

class QueueLockService {
  static ControllerQueue = {
    noteControllerQueue: "noteControllerQueue",
    reviewControllerQueue: "reviewControllerQueue",
    userControllerQueue: "userControllerQueue",
    schoolControllerQueue: "schoolControllerQueue",
    subjectControllerQueue: "subjectControllerQueue",
    purchaseTransactionRefundControllerQueue: "purchaseTransactionRefundControllerQueue"
  }

  static DatabaseQueue = {
    notes: "notes",
    purchases: "purchases",
    refunds: "refunds",
    reviews: "reviews",
    schools: "schools",
    subjects: "subjects",
    transactions: "transactions",
    users: "users",
    carts: "carts",
    withdrawals: "withdrawals",
  }

  // Shared client and server id (single client per server process).
  static #zookeeperClient = zookeeper.createClient("127.0.0.1:2181");
  static #serverId = uuidv4();

  // MongoDb transaction options for ACID transactions.
  static mongoDbTransactionOptions = {
    readPreference: "primary",
    readConcern: {level: "snapshot"},
    writeConcern: {w: "majority"}
  };

  #queueName;
  #basePrefix;
  #mongoDbSession;

  /**
   * @param {string} queueName - one of ControllerQueue values
   */
  constructor(queueName) {
    if (!(Object.values(QueueLockService.ControllerQueue).includes(queueName) ||
      Object.values(QueueLockService.DatabaseQueue).includes(queueName))) {
      throw new Error(`Invalid queue name: ${queueName}`);
    }
    this.#queueName = queueName;
    this.#basePrefix = `/locks/${this.#queueName}`;
  }

  static initialiseClient() {
    try {
      QueueLockService.#zookeeperClient.connect();

      QueueLockService.#zookeeperClient.on("connected", () => {
        console.log("ZooKeeper client connected successfully.");
      });
      QueueLockService.#zookeeperClient.on("disconnected", () => {
        console.error("ZooKeeper client disconnected.");
      });

      return "ZooKeeper client connecting...";
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  /**
   * Ensure a persistent path exists (creates intermediate nodes).
   * @param path The path to check (e.g. /locks/userControllerQueue/uid%3D123).
   * @returns {Promise<unknown>}
   */
  static #ensurePath(path) {
    const client = QueueLockService.#zookeeperClient;

    return new Promise((resolve, reject) => {
      // Split path into segments whilst removing all falsy values (e.g. empty strings).
      const segments = path.split("/").filter(Boolean);

      if (segments.length === 0) return resolve();

      // Build the path incrementally (e.g. "/a", "/a/b", "/a/b/c").
      let currentPath = "";
      const createNextSegment = (index) => {
        // If we've processed all segments, the full path exists and return.
        if (index > segments.length - 1) return resolve();

        // Append the next segment to the running path.
        currentPath += "/" + segments[index];

        // Check if the node already exists.
        client.exists(currentPath, (error, stat) => {
          if (error) {
            return reject(error);
          }

          // If client exists.
          if (stat) {
            return createNextSegment(index + 1);
          }

          // If node does not exist, attempt to create it as a persistent node.
          client.create(currentPath, (createError) => {
            if (createError) {
              // If another client created the node between the exists() and create() calls,
              // ZK will return NODE_EXISTS. Treat that as success and continue.
              if (createError.getCode && createError.getCode() === zookeeper.Exception.NODE_EXISTS) {
                return createNextSegment(index + 1);
              }
              // Any other create error is fatal.
              return reject(createError);
            }

            return createNextSegment(index + 1);
          });
        });
      };

      // Start creating from the first segment.
      createNextSegment(0);
    });
  }

  /**
   * Create an ephemeral sequential node under prefixPath with JSON payload.
   * @param prefixPath The prefix path for the node.
   * @param payload THe JSON object for the node.
   * @returns {Promise<string>} The full path.
   */
  static #createNode(prefixPath, payload) {
    const client = QueueLockService.#zookeeperClient;
    return new Promise((resolve, reject) => {
      const buffer = Buffer.from(JSON.stringify(payload || {}));
      const createPath = `${prefixPath}/lock-`;
      client.create(createPath, buffer, zookeeper.CreateMode.EPHEMERAL_SEQUENTIAL, (error, path) => {
        if (error) return reject(error);
        return resolve(path);
      });
    });
  }

  /**
   * Get data for a path and stat.
   * @param path The path to get data of.
   * @returns {Promise<{ data: Object, stat: Object }>} Data and stat.
   */
  static #getDataAndStat(path) {
    return new Promise((resolve, reject) => {
      QueueLockService.#zookeeperClient.getData(path, (error, data, stat) => {
        if (error) {
          return reject(error);
        }
        resolve({ data, stat });
      });
    });
  }

  /**
   * Get children sorted lexicographically for a path and stat.
   * @param path The path to sort.
   * @returns {Promise<{ children: string[], stat: Object }>} A list of children sorted in lexicographic order and
   * the stat.
   */
  static #getSortedChildrenAndStat(path) {
    return new Promise((resolve, reject) => {
      QueueLockService.#zookeeperClient.getChildren(path, (error, children, stat) => {
        if (error) {
          return reject(error);
        }
        children.sort();
        resolve({ children, stat });
      });
    });
  }

  /**
   * Wait for a znode to be deleted. If deadline is provided, reject when deadline is exceeded.
   * @param pathToWatch The full path to watch for NODE_DELETED events.
   * @param deadline The time deadline.
   * @returns {Promise<unknown>}
   */
  static #waitForDelete(pathToWatch, deadline) {
    return new Promise((resolve, reject) => {
      let timer = null;

      if (deadline) {
        const timeLeft = deadline - Date.now();
        // Reject immediately if deadline is exceeded.
        if (timeLeft <= 0) {
          return reject(new Error("Timeout waiting for predecessor deletion"))
        }
        // Set timeout to reject when deadline is exceeded.
        timer = setTimeout(() => {
          return reject(new Error("Timeout waiting for predecessor deletion"));
        }, timeLeft);
      }

      // Watcher function to run on node deletion.
      const watcher = (event) => {
        try {
          // Resolve if node is deleted.
          if (event && event.getType && event.getType() === zookeeper.Event.NODE_DELETED) {
            if (timer) clearTimeout(timer);
            return resolve();
          }
        } catch (error) {
          // Reject on error.
          if (timer) clearTimeout(timer);
          return reject(error);
        }
      };

      // Attach watcher function to pathToWatch.
      QueueLockService.#zookeeperClient.exists(pathToWatch, watcher, (error, stat) => {
        if (error) {
          if (timer) clearTimeout(timer);
          return reject(error);
        }
        // If node does not exist, resolve.
        if (!stat) {
          if (timer) clearTimeout(timer);
          return resolve();
        }
        // Listen for deletion events of predecessor node.
      });
    });
  }

  /**
   * Attempt best-effort deletion of ephemeral nodes and its parents if parent has no children left.
   * @param nodePaths{string[]} A list of nodes to delete.
   * @returns {Promise<unknown>}
   */
  static async #cleanupNodes(nodePaths = []) {
    const client = QueueLockService.#zookeeperClient;

    // Helper to promisify remove with version.
    const removeNode = (path, version = -1) => {
      return new Promise((resolve) => {
        client.remove(path, version, (error) => {
          if (!error) {
            return resolve({ok: true})
          }
          return resolve({ ok: false, error });
        });
      });
    };

    for (const nodePath of nodePaths) {
      try {
        // Try to remove the ephemeral node (e.g. lock-0000000001).
        await removeNode(nodePath, -1);

        // Attempt to remove parent key node (e.g. id%3DJOU0TZkBNWDT1NEa9TpF) if it has no children.
        const parentPath = nodePath.substring(0, nodePath.lastIndexOf("/"));
        // If there is no parent (shouldn't happen for valid lock nodes), skip.
        if (!parentPath || parentPath === "") continue;

        // Get stat for the parent path.
        let parentStat;
        try {
          parentStat = (await QueueLockService.#getDataAndStat(parentPath)).stat;
        } catch (error) {
          console.log(error);
          continue;
        }

        // Only attempt delete if there are no children.
        if (parentStat.numChildren === 0) {
          // If a child exists, a NOT_EMPTY error will be thrown.
          await removeNode(parentPath, parentStat.version);
        }
      } catch (error) {
        console.log(error);
      }
    }
  }

  /**
   * Add a job to the queue and wait until it's the first in line for its key.
   * @param keys{{  }} An object of unique identifiers and its values for sequencing jobs (e.g. {"id": "123"}).
   * @param callback{function} The function to execute after the job has been picked up from queue.
   * @param options{{ createTransaction: boolean }} { createTransaction: True if a MongoDB session transaction should be created for the job }
   * @returns {Promise<void>}
   */
  async processJob(keys = {}, callback, options = { createTransaction: false }) {
    assert(keys && typeof keys === "object", "keys must be an object");
    assert(typeof callback === "function", "callback must be a function");

    const acquireTimeoutMs = 30_000; // 30 second timeout (in milliseconds).
    const jobId = uuidv4();
    const createdAt = Date.now();

    // Build list of key entries.
    const keyEntries = [];
    if (Object.keys(keys).length === 0) {
      keyEntries.push({ keyName: "__global__", encoded: encodeURIComponent("__global__") });
    } else {
      for (const [key, value] of Object.entries(keys)) {
        const keyName = `${key}=${value}`;
        // e.g. [{ keyName: "uid=123", encoded: "uid%3D123" }]
        keyEntries.push({ keyName, encoded: encodeURIComponent(keyName) });
      }
    }

    // Sort keys in a deterministic order (lexicographic on encoded key) to avoid deadlocks.
    keyEntries.sort((a, b) => a.encoded.localeCompare(b.encoded));

    const createdNodePaths = []; // Holds node paths for each key.
    const deadline = Date.now() + acquireTimeoutMs;
    try {
      // Create ephemeral sequential nodes for each key (in deterministic order).
      for (const keyEntry of keyEntries) {
        const prefixPath = `${this.#basePrefix}/${keyEntry.encoded}`;
        await QueueLockService.#ensurePath(prefixPath);

        // Metadata.
        const payload = {
          jobId,
          serverId: QueueLockService.#serverId,
          queueName: this.#queueName,
          key: keyEntry.keyName,
          createdAt
        };

        // Create ephemeral sequential node.
        const nodeFullPath = await QueueLockService.#createNode(prefixPath, payload);
        createdNodePaths.push(nodeFullPath);
      }

      // For each created node, ensure it's the lowest child (first) in its parent path.
      for (let i = 0; i < createdNodePaths.length; i++) {
        const nodePath = createdNodePaths[i];
        const parentPrefixPath = nodePath.substring(0, nodePath.lastIndexOf("/"));
        const nodeBaseName = nodePath.substring(nodePath.lastIndexOf("/") + 1);

        while (true) {
          if (Date.now() > deadline) {
            throw new Error("Timeout acquiring locks");
          }

          const childNames = (await QueueLockService.#getSortedChildrenAndStat(parentPrefixPath)).children;
          // Lost node.
          if (childNames.length === 0) {
            throw new Error(`Lost node for prefix ${parentPrefixPath} while waiting`);
          }

          // Node disappeared from queue.
          const myIndex = childNames.indexOf(nodeBaseName);
          if (myIndex === -1) {
            throw new Error(`Node ${nodeBaseName} disappeared from ${parentPrefixPath}`);
          }

          // Node is first in queue, move to next key.
          if (myIndex === 0) {
            break;
          }

          // Get node that is in queue before this node.
          const predecessorNodeName = childNames[myIndex - 1];
          const predecessorNodePath = `${parentPrefixPath}/${predecessorNodeName}`;

          // Wait for predecessor to be deleted (respect global deadline).
          await QueueLockService.#waitForDelete(predecessorNodePath, deadline);
          // When predecessor is deleted, re-loop to re-evaluate.
        }
      }
      // If we reach here, we are first in queue for each key.

      let result;
      if (options?.createTransaction === true) {
        // Start MongoDB transaction if createTransaction is true.
        this.#mongoDbSession = await startSession();
        this.#mongoDbSession.startTransaction(QueueLockService.mongoDbTransactionOptions);

        result = await Promise.resolve(callback(this.#mongoDbSession)); // Pass mongoDbSession to callback.
        await this.#mongoDbSession.commitTransaction(); // Commit mongoDb transaction.
      } else {
        result = await Promise.resolve(callback());
      }

      // Cleanup created nodes.
      await QueueLockService.#cleanupNodes(createdNodePaths).catch((error) => {
        console.error(error);
      });

      return result;
    } catch (error) {
      // Abort mongoDbSession transaction, if any.
      if (this.#mongoDbSession) await this.#mongoDbSession.abortTransaction();
      // Attempt to clean up created nodes on error.
      await QueueLockService.#cleanupNodes(createdNodePaths);

      throw error;
    } finally {
      // End mongoDbSession, if any.
      if (this.#mongoDbSession) await this.#mongoDbSession.endSession();
    }
  }
}

module.exports = QueueLockService;