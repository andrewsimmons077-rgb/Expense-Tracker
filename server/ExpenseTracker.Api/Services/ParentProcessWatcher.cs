using System.Diagnostics;

namespace ExpenseTracker.Api.Services;

/// <summary>
/// Desktop build only: stops the API when the app that launched it goes away, even if that app crashed
/// or was force-closed and never got the chance to stop it.
/// </summary>
public class ParentProcessWatcher(int parentPid, IHostApplicationLifetime lifetime, ILogger<ParentProcessWatcher> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            if (!IsRunning(parentPid))
            {
                logger.LogInformation("Parent process {Pid} has exited; shutting down.", parentPid);
                lifetime.StopApplication();
                return;
            }
            await Task.Delay(TimeSpan.FromSeconds(2), stoppingToken);
        }
    }

    private static bool IsRunning(int pid)
    {
        try
        {
            using var process = Process.GetProcessById(pid);
            return !process.HasExited;
        }
        catch (ArgumentException)
        {
            return false;
        }
    }
}
