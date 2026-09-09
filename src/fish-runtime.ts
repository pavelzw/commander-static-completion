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
    set -l operands 0
    set -l settings (__PREFIX___settings $state)
    set -l ended 0
    set -l pending ''
    set -l pending_value -1
    set -l pending_variadic 0
    set -l info
    set -l lead ''
    set -l cluster_prefix ''
    set -l alternatives

    set -l tokens $argv[2..-1]
    while true
        set settings (__PREFIX___settings $state)
        set pending ''
        if test $ended -eq 0
            set -l filtered (__PREFIX___filter $state "$current" $tokens | string split0)
            set pending "$filtered[1]"
            set pending_value $filtered[2]
            set pending_variadic $filtered[3]
            set tokens $filtered[4..-1]
        end
        if test -n "$pending"; and begin; test "$pending" = required; or not string match -q -- '-*' "$current"; or test "$current" = -; or begin; test "$settings[2]" = 1; and string match -qr -- '^-([0-9]+|[0-9]*[.][0-9]+)(e[+-]?[0-9]+)?$' "$current"; end; end
            break
        end
        set pending ''
        set -l dispatched 0
        set -l index 1
        while test $index -le (count $tokens)
            set -l word "$tokens[$index]"
            set index (math $index + 1)
            if test $ended -eq 0; and test "$word" = --
                set ended 1
                continue
            end
            if test $operands -eq 0
                set -l next (__PREFIX___child $state "$word")
                set -l consume 1
                if test "$next" = -1; and test "$settings[4]" != -1
                    set next $settings[4]
                    set consume 0
                end
                if test "$next" != -1
                    set state $next
                    set position 0
                    if test $consume -eq 0
                        set index (math $index - 1)
                    end
                    set tokens $tokens[$index..-1]
                    set dispatched 1
                    break
                end
            end
            set operands (math $operands + 1)
            if test "$settings[1]" = 1
                set ended 1
            end
            set info (__PREFIX___argument $state $position)
            if test "$info[2]" = 0
                set position (math $position + 1)
            end
        end
        if test $dispatched -eq 0
            if test $operands -ne 0; or test "$settings[4]" = -1
                break
            end
            if test $ended -eq 0; and string match -qr -- '^-.+' "$current"
                if string match -q -- '--*' "$current"
                    set -l flag (string split -m 1 = -- "$current")[1]
                    set info (__PREFIX___option $state "$flag")
                else
                    set -l rest (string sub -s 2 -- "$current")
                    set -l consumed ''
                    while test -n "$rest"
                        set -l letter (string sub -l 1 -- "$rest")
                        set info (__PREFIX___option $state "-$letter")
                        if test "$info[1]" = unknown
                            set cluster_prefix "$cluster_prefix$consumed"
                            set current "-$rest"
                            break
                        end
                        if test "$info[1]" != boolean
                            break
                        end
                        set consumed "$consumed$letter"
                        set rest (string sub -s 2 -- "$rest")
                    end
                end
                if test "$info[1]" != unknown
                    break
                end
            end
            set -a alternatives (__PREFIX___commands $state)
            if test $ended -eq 0
                set -a alternatives (__PREFIX___flags $state)
            end
            set state $settings[4]
            set tokens
        end
    end

    set -l value -1
    if test -n "$pending"; and begin; test "$pending" = required; or not string match -q -- '-*' "$current"; or test "$current" = -; or begin; test "$settings[2]" = 1; and string match -qr -- '^-([0-9]+|[0-9]*[.][0-9]+)(e[+-]?[0-9]+)?$' "$current"; end; end
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
        set -l suggestions $alternatives
        if test $operands -eq 0
            set -a suggestions (__PREFIX___commands $state)
        end
        if test $ended -eq 0
            set -a suggestions (__PREFIX___flags $state)
        end
        for candidate in $suggestions
            if test -n "$cluster_prefix"; and string match -qr -- '^-[^-]' "$candidate"
                set candidate "-$cluster_prefix"(string sub -s 2 -- "$candidate")
            end
            printf '%s\n' "$candidate"
        end
        set info (__PREFIX___argument $state $position)
        set value $info[1]
    end
    if test -n "$cluster_prefix"; and test -n "$lead"
        set lead "-$cluster_prefix"(string sub -s 2 -- "$lead")
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
function __PREFIX___filter
    set -l state $argv[1]
    set -l tokens $argv[3..-1]
    set -l settings (__PREFIX___settings $state)
    set -l pending ''
    set -l pending_value -1
    set -l pending_variadic 0
    set -l filtered
    set -l index 1
    set -l seen 0
    while test $index -le (count $tokens)
        set -l token "$tokens[$index]"
        set -l original_index $index
        set index (math $index + 1)
        if test -n "$pending"
            if test "$pending" = required; or not string match -q -- '-*' "$token"; or test "$token" = -; or begin; test "$settings[2]" = 1; and string match -qr -- '^-([0-9]+|[0-9]*[.][0-9]+)(e[+-]?[0-9]+)?$' "$token"; end
                if test $pending_variadic -eq 1
                    set pending optional
                else
                    set pending ''
                end
                continue
            end
            set pending ''
        end
        if test "$token" = --
            set -a filtered $tokens[$original_index..-1]
            break
        end
        set -l info (__PREFIX___local_option $state "$token")
        set -l attached 0
        if test "$info[1]" = unknown; and string match -q -- '--*=*' "$token"
            set -l parts (string split -m 1 = -- "$token")
            set info (__PREFIX___local_option $state "$parts[1]")
            if test "$info[1]" = boolean
                set info unknown -1 0
            end
            set attached 1
        else if test "$info[1]" = unknown; and string match -qr -- '^-.+' "$token"; and not string match -q -- '--*' "$token"
            set -l rest (string sub -s 2 -- "$token")
            while test -n "$rest"
                set -l flag -(string sub -l 1 -- "$rest")
                set info (__PREFIX___local_option $state "$flag")
                if test "$info[1]" = unknown
                    set token "-$rest"
                    break
                end
                set rest (string sub -s 2 -- "$rest")
                if test "$info[1]" != boolean
                    if test -n "$rest"
                        set attached 1
                    end
                    break
                end
            end
        end
        if test "$info[1]" != unknown
            if test "$info[1]" != boolean; and test $attached -eq 0
                set pending $info[1]
                set pending_value $info[2]
                set pending_variadic $info[3]
            end
            continue
        end
        if begin; test "$settings[3]" = 1; or test "$settings[1]" = 1; end; and test $seen -eq 0
            set -l next (__PREFIX___child $state "$token")
            if test "$next" != -1; or test "$settings[4]" != -1
                set -a filtered $tokens[$original_index..-1]
                break
            end
        end
        set -a filtered "$token"
        set seen (math $seen + 1)
        if test "$settings[1]" = 1
            set -a filtered $tokens[$index..-1]
            break
        end
    end
    printf '%s\0' "$pending" "$pending_value" "$pending_variadic" $filtered
end
`;
