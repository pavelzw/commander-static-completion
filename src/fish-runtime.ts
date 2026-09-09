// The generated scanner runs only Fish builtins and native completion helpers.
export const fishRuntime = String.raw`
function __PREFIX__
    set -l tokens (commandline -xpc)
    set -l current (commandline -ct)
    # Unescape a complete token; leave incomplete quoting to Fish's matcher.
    set -l unescaped (string unescape -- "$current")
    if test (count $unescaped) -eq 1
        set current "$unescaped"
    end
    __PREFIX___scan "$current" $tokens[2..-1]
end

function __PREFIX___scan
    set -l current "$argv[1]"
    set -l state 0
    set -l position 0
    set -l ended 0
    set -l pending ''
    set -l pending_value -1
    set -l pending_variadic 0
    set -l info
    set -l lead ''

    for word in $argv[2..-1]
        if test -n "$pending"
            if test "$pending" = required; or not string match -q -- '-*' "$word"; or test "$word" = -
                if test $pending_variadic -eq 1
                    set pending optional
                else
                    set pending ''
                end
                continue
            end
            set pending ''
        end
        if test $ended -eq 0; and test "$word" = --
            set ended 1
            continue
        end
        if test $ended -eq 0; and string match -q -- '--*' "$word"
            set -l parts (string split -m 1 = -- "$word")
            set info (__PREFIX___option $state "$parts[1]")
            if contains -- "$info[1]" required optional
                if test (count $parts) -eq 1
                    set pending $info[1]
                    set pending_value $info[2]
                    set pending_variadic $info[3]
                else if test "$info[3]" = 1
                    set pending optional
                    set pending_value $info[2]
                    set pending_variadic 1
                end
            end
            continue
        end
        if test $ended -eq 0; and string match -qr -- '^-.+' "$word"
            set -l rest (string sub -s 2 -- "$word")
            while test -n "$rest"
                set -l flag -(string sub -l 1 -- "$rest")
                set rest (string sub -s 2 -- "$rest")
                set info (__PREFIX___option $state "$flag")
                if test "$info[1]" = unknown
                    break
                end
                if test "$info[1]" != boolean
                    if test -z "$rest"
                        set pending $info[1]
                        set pending_value $info[2]
                        set pending_variadic $info[3]
                    else if test "$info[3]" = 1
                        set pending optional
                        set pending_value $info[2]
                        set pending_variadic 1
                    end
                    break
                end
            end
            continue
        end
        if test $ended -eq 0; and test $position -eq 0
            set -l next (__PREFIX___child $state "$word")
            if test "$next" != -1
                set state $next
                set position 0
                continue
            end
        end
        set info (__PREFIX___argument $state $position)
        if test "$info[2]" = 0
            set position (math $position + 1)
        end
    end

    set -l value -1
    if test -n "$pending"; and begin; test "$pending" = required; or not string match -q -- '-*' "$current"; or test "$current" = -; end
        set value $pending_value
    else if test $ended -eq 0; and string match -q -- '--*=*' "$current"
        set -l parts (string split -m 1 = -- "$current")
        set info (__PREFIX___option $state "$parts[1]")
        if not contains -- "$info[1]" required optional
            return
        end
        set value $info[2]
        set lead "$parts[1]="
        set current "$parts[2]"
    else if test $ended -eq 0; and string match -qr -- '^-.+' "$current"; and not string match -q -- '--*' "$current"
        set -l rest (string sub -s 2 -- "$current")
        set -l attached -
        while test -n "$rest"
            set -l letter (string sub -l 1 -- "$rest")
            set attached "$attached$letter"
            set rest (string sub -s 2 -- "$rest")
            set info (__PREFIX___option $state "-$letter")
            if test "$info[1]" = unknown
                break
            end
            if test "$info[1]" != boolean; and test -n "$rest"
                set value $info[2]
                set lead "$attached"
                set current "$rest"
                break
            end
        end
    end

    if test $value -lt 0
        if test $ended -eq 0
            if test $position -eq 0
                __PREFIX___commands $state
            end
            __PREFIX___flags $state
        end
        set info (__PREFIX___argument $state $position)
        set value $info[1]
    end
    for candidate in (__PREFIX___values $value)
        printf '%s\n' "$lead$candidate"
    end
    set -l kind (__PREFIX___kind $value)
    if test "$kind" = file; or test "$kind" = directory
        set -l escaped (string escape -- "$current")
        set -l paths
        if test "$kind" = directory
            set paths (__fish_complete_directories "$escaped")
        else
            set paths (__fish_complete_path "$escaped")
        end
        for candidate in $paths
            printf '%s\n' "$lead$candidate"
        end
    end
end
`;
